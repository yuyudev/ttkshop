import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';

@Injectable()
export class TiktokOrderClient {
  private readonly openBase: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly tiktokShopService: TiktokShopService,
  ) {
    this.openBase = this.configService.getOrThrow<string>('TIKTOK_BASE_OPEN', { infer: true });
  }

  async listOrders(shopId: string, params: Record<string, string> = {}) {
    return this.request(shopId, 'get', '/api/orders/search', undefined, params);
  }

  async getOrder(shopId: string, orderId: string) {
    return this.request(shopId, 'get', `/api/orders/${orderId}`);
  }

  async ackOrder(shopId: string, orderId: string) {
    return this.request(shopId, 'post', '/api/orders/ack', { order_id: orderId });
  }

  private async request(
    shopId: string,
    method: 'get' | 'post',
    path: string,
    payload?: unknown,
    params?: Record<string, string>,
  ) {
    const token = await this.tiktokShopService.getAccessToken(shopId);
    const url = `${this.openBase}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (method === 'get') {
      return firstValueFrom(this.http.get(url, { headers, params }));
    }

    return firstValueFrom(this.http.post(url, payload, { headers, params }));
  }
}
