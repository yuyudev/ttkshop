import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';

@Injectable()
export class VtexOrdersClient {
  private readonly account: string;
  private readonly environment: string;
  private readonly domainOverride?: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VtexOrdersClient.name);
    this.account = this.configService.getOrThrow<string>('VTEX_ACCOUNT', { infer: true });
    this.environment = this.configService.getOrThrow<string>('VTEX_ENVIRONMENT', { infer: true });
    this.domainOverride = this.configService.get<string>('VTEX_DOMAIN', { infer: true });
  }

  async createOrder(payload: unknown) {
    // Use Fulfillment API for external marketplace orders
    const url = `${this.baseUrl()}/fulfillment/pvt/orders`;
    // Add sales channel query param (default to 1 or config)
    const sc = this.configService.get<string>('VTEX_SALES_CHANNEL') ?? '1';
    return firstValueFrom(this.http.post(url, payload, {
      headers: this.headers(),
      params: { sc }
    }));
  }

  async getOrder(orderId: string) {
    const url = `${this.baseUrl()}/oms/pvt/orders/${orderId}`;
    return firstValueFrom(this.http.get(url, { headers: this.headers() }));
  }

  async simulateOrder(items: any[], postalCode: string, country: string) {
    // Correct endpoint for simulation: /api/checkout/pub/orderForms/simulation
    const url = `${this.baseUrl()}/checkout/pub/orderForms/simulation`;
    const payload = {
      items: items.map(item => ({
        id: item.id,
        quantity: item.quantity,
        seller: item.seller,
      })),
      postalCode,
      country,
    };
    this.logger.info({ url, payload }, 'Calling VTEX simulation endpoint');
    return firstValueFrom(this.http.post(url, payload, { headers: this.headers() }));
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
