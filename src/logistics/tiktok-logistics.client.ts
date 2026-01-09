import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';

@Injectable()
export class TiktokLogisticsClient {
  private readonly servicesBase: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly tiktokShopService: TiktokShopService,
  ) {
    this.servicesBase = this.configService.getOrThrow<string>('TIKTOK_BASE_SERV', { infer: true });
  }

  async getOrCreateShippingDocument(shopId: string, orderId: string) {
    return this.request(shopId, 'post', '/api/logistics/shipping_document', {
      order_id: orderId,
    });
  }

  async getShippingDocument(shopId: string, orderId: string) {
    return this.request(shopId, 'get', `/api/logistics/shipping_document/${orderId}`);
  }

  private async request(
    shopId: string,
    method: 'get' | 'post',
    path: string,
    payload?: unknown,
  ) {
    return this.withTokenRetry(shopId, async (token) => {
      const url = `${this.servicesBase}${path}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      if (method === 'get') {
        return firstValueFrom(this.http.get(url, { headers }));
      }

      return firstValueFrom(this.http.post(url, payload, { headers }));
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
      token = await this.tiktokShopService.refresh(shopId);
      return fn(token);
    }
  }
}
