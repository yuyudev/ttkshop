import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
import { buildSignedRequest } from '../common/signer';

@Injectable()
export class TiktokOrderClient {
  private readonly openBase: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly shopCipher: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly tiktokShopService: TiktokShopService,
  ) {
    this.openBase = this.configService.getOrThrow<string>('TIKTOK_BASE_OPEN', { infer: true });
    this.appKey = this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true });
    this.appSecret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
    this.shopCipher = this.configService.getOrThrow<string>('TIKTOK_SHOP_CIPHER', { infer: true });
  }

  async listOrders(shopId: string, params: Record<string, string> = {}) {
    return this.request(shopId, 'get', '/order/202309/orders/search', undefined, params);
  }

  async getOrder(shopId: string, orderId: string) {
    // API v202309 uses /order/202309/orders with ids query param
    return this.request(shopId, 'get', '/order/202309/orders', undefined, { ids: orderId });
  }

  async ackOrder(shopId: string, orderId: string) {
    return this.request(shopId, 'post', '/order/202309/orders/ack', { order_ids: [orderId] });
  }

  private async request(
    shopId: string,
    method: 'get' | 'post',
    path: string,
    payload?: unknown,
    params?: Record<string, string>,
  ) {
    return this.withTokenRetry(shopId, async (token) => {
      // Ensure base URL doesn't have trailing slash and path starts with slash
      const baseUrl = this.openBase.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;

      const { url, headers, body } = buildSignedRequest(
        baseUrl,
        cleanPath,
        this.appKey,
        this.appSecret,
        {
          qs: {
            shop_cipher: this.shopCipher,
            shop_id: shopId,
            ...params,
          },
          headers: {
            'x-tts-access-token': token,
          },
          body: payload,
        }
      );

      // buildSignedRequest returns the full URL with query string (including sign, timestamp, app_key)
      // So we should NOT pass params to axios again, otherwise they will be duplicated.

      if (method === 'get') {
        return firstValueFrom(this.http.get(url, { headers }));
      }

      return firstValueFrom(this.http.post(url, body, { headers }));
    });
  }

  private isExpiredError(err: any): boolean {
    const status = err?.response?.status;
    const code = err?.response?.data?.code;
    const message = err?.response?.data?.message;
    return status === 401 || code === 105002 || message?.toString?.().includes('Expired credentials');
  }

  private async withTokenRetry<T>(shopId: string, fn: (token: string) => Promise<T>): Promise<T> {
    let token = await this.tiktokShopService.getAccessToken(shopId);
    try {
      return await fn(token);
    } catch (err) {
      if (!this.isExpiredError(err)) {
        throw err;
      }
      // refresh and retry once
      token = await this.tiktokShopService.refresh(shopId);
      return fn(token);
    }
  }
}
