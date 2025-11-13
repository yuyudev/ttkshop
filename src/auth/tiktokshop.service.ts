import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCryptoService } from '../common/token-crypto.service';

interface TikTokTokenPayload {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in?: number;
  scope?: string;
  shop_id?: string;
}

@Injectable()
export class TiktokShopService {
  private readonly authBase: string;
  private readonly appKey: string;
  private readonly appSecret: string;

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    this.authBase = this.configService.getOrThrow<string>('TIKTOK_BASE_AUTH', { infer: true });
    this.appKey = this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true });
    this.appSecret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
  }

  async exchangeAuthorizationCode(code: string, explicitShopId?: string) {
    const url = `${this.authBase}/api/v2/token/get`;
    const params = new URLSearchParams({
      grant_type: 'authorized_code',
      auth_code: code,
      app_key: this.appKey,
      app_secret: this.appSecret,
    });

    const { data } = await firstValueFrom(
      this.http.post<{ data: TikTokTokenPayload }>(url, null, { params }),
    );

    const payload = data.data;
    const shopId = explicitShopId ?? payload.shop_id;
    if (!shopId) {
      throw new Error('TikTok response did not include shop_id');
    }

    const refreshTokenEncrypted = this.tokenCrypto.encrypt(payload.refresh_token);
    const accessExpiresAt = this.calculateExpiry(payload.access_token_expire_in);
    const refreshExpiresAt = this.calculateExpiry(payload.refresh_token_expire_in ?? 0);

    await this.prisma.tiktokAuth.upsert({
      where: { shopId },
      update: {
        accessToken: payload.access_token,
        accessExpiresAt,
        refreshToken: refreshTokenEncrypted,
        scopes: payload.scope,
      },
      create: {
        shopId,
        accessToken: payload.access_token,
        accessExpiresAt,
        refreshToken: refreshTokenEncrypted,
        scopes: payload.scope,
      },
    });

    return { shopId, accessToken: payload.access_token, refreshExpiresAt };
  }

  async refresh(shopId: string): Promise<string> {
    const record = await this.prisma.tiktokAuth.findUnique({
      where: { shopId },
    });
    if (!record) {
      throw new NotFoundException(`No TikTok auth record for shop ${shopId}`);
    }

    const refreshToken = this.tokenCrypto.decrypt(record.refreshToken);
    const url = `${this.authBase}/api/v2/token/get`;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      app_key: this.appKey,
      app_secret: this.appSecret,
    });

    const { data } = await firstValueFrom(
      this.http.post<{ data: TikTokTokenPayload }>(url, null, { params }),
    );
    const payload = data.data;

    const refreshTokenEncrypted = this.tokenCrypto.encrypt(payload.refresh_token);

    await this.prisma.tiktokAuth.update({
      where: { shopId },
      data: {
        accessToken: payload.access_token,
        accessExpiresAt: this.calculateExpiry(payload.access_token_expire_in),
        refreshToken: refreshTokenEncrypted,
        scopes: payload.scope,
      },
    });

    return payload.access_token;
  }

  async getAccessToken(shopId: string): Promise<string> {
    const record = await this.prisma.tiktokAuth.findUnique({
      where: { shopId },
    });

    if (!record) {
      throw new NotFoundException(`No TikTok token found for shop ${shopId}`);
    }

    const isExpired =
      !record.accessExpiresAt || record.accessExpiresAt.getTime() < Date.now() + 60_000;

    if (isExpired) {
      return this.refresh(shopId);
    }

    return record.accessToken;
  }

  private calculateExpiry(seconds: number): Date {
    if (!seconds) {
      return new Date(Date.now() + 5 * 60 * 1000);
    }
    return new Date(Date.now() + seconds * 1000);
  }
}
