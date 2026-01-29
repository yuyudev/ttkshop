import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
import { buildSignedRequest } from '../common/signer';
import { ShopConfigService } from '../common/shop-config.service';

@Injectable()
export class TiktokOrderClient {
  private readonly openBase: string;
  private readonly appKey: string;
  private readonly appSecret: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly tiktokShopService: TiktokShopService,
    private readonly shopConfigService: ShopConfigService,
  ) {
    this.openBase = this.configService.getOrThrow<string>('TIKTOK_BASE_OPEN', { infer: true });
    this.appKey = this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true });
    this.appSecret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
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

  async uploadInvoice(
    shopId: string,
    payload: { invoices: Array<{ package_id: string; order_ids: string | string[]; file_type: string; file: string }> },
  ) {
    return this.withTokenRetry(shopId, async (token) => {
      const baseUrl = this.openBase.replace(/\/$/, '');
      const cleanPath = '/fulfillment/202502/invoice/upload';

      const normalizedBody = {
        invoices: (payload.invoices ?? []).map((invoice) => ({
          ...invoice,
          order_ids: Array.isArray(invoice.order_ids) ? invoice.order_ids : [invoice.order_ids],
        })),
      };

      const shopConfig = await this.shopConfigService.getTiktokOrderConfig(shopId);
      const { url, headers, body } = buildSignedRequest(
        baseUrl,
        cleanPath,
        this.appKey,
        this.appSecret,
        {
          qs: {
            shop_cipher: shopConfig.shopCipher,
          },
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            'x-tts-access-token': token,
          },
          body: normalizedBody,
        },
      );

      try {
        const response = await firstValueFrom(this.http.post(url, normalizedBody, { headers }));
        const code = response.data?.code;
        if (code !== undefined && code !== 0) {
          const message = response.data?.message ?? 'Unknown';
          throw new Error(
            `TikTok invoice upload failed: code=${code} message=${message} data=${JSON.stringify(response.data)}`,
          );
        }
        return response;
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        if (status && data) {
          throw new Error(
            `TikTok invoice upload HTTP ${status}: ${JSON.stringify(data)}`,
          );
        }
        throw err;
      }
    });
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

      const shopConfig = await this.shopConfigService.getTiktokOrderConfig(shopId);
      const { url, headers, body } = buildSignedRequest(
        baseUrl,
        cleanPath,
        this.appKey,
        this.appSecret,
        {
          qs: {
            shop_cipher: shopConfig.shopCipher,
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
