import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';

@Injectable()
export class VtexOrdersClient {
  private readonly account: string;
  private readonly environment: string;
  private readonly domainOverride?: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    this.account = this.configService.getOrThrow<string>('VTEX_ACCOUNT', { infer: true });
    this.environment = this.configService.getOrThrow<string>('VTEX_ENVIRONMENT', { infer: true });
    this.domainOverride = this.configService.get<string>('VTEX_DOMAIN', { infer: true });
  }

  async createOrder(payload: unknown) {
    const url = `${this.baseUrl()}/oms/pvt/orders`;
    return firstValueFrom(this.http.post(url, payload, { headers: this.headers() }));
  }

  async getOrder(orderId: string) {
    const url = `${this.baseUrl()}/oms/pvt/orders/${orderId}`;
    return firstValueFrom(this.http.get(url, { headers: this.headers() }));
  }

  async updateTracking(orderId: string, invoiceData: any) {
    // VTEX Invoice API: POST /oms/pvt/orders/{orderId}/invoice
    // Payload structure:
    // {
    //   "type": "Output",
    //   "invoiceNumber": "...",
    //   "issuanceDate": "2024-01-01",
    //   "invoiceValue": 1000,
    //   "trackingNumber": "...",
    //   "courier": "...",
    //   "items": [...]
    // }
    const url = `${this.baseUrl()}/oms/pvt/orders/${orderId}/invoice`;
    return firstValueFrom(this.http.post(url, invoiceData, { headers: this.headers() }));
  }

  private baseUrl(): string {
    if (this.domainOverride) {
      const base = this.domainOverride.startsWith('http')
        ? this.domainOverride
        : `https://${this.domainOverride}`;
      return base.replace(/\/+$/, '') + '/api';
    }
    const suffix = this.environment.includes('.')
      ? this.environment
      : `${this.environment}.com`;
    return `https://${this.account}.${suffix}/api`;
  }

  private headers() {
    const appKey = this.configService.getOrThrow<string>('VTEX_APP_KEY', { infer: true });
    const appToken = this.configService.getOrThrow<string>('VTEX_APP_TOKEN', { infer: true });
    return {
      'X-VTEX-API-AppKey': appKey,
      'X-VTEX-API-AppToken': appToken,
      'Content-Type': 'application/json',
    };
  }
}
