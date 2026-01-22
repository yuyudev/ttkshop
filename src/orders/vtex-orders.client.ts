import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
import { ShopConfigService, VtexShopConfig } from '../common/shop-config.service';

@Injectable()
export class VtexOrdersClient {
  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly shopConfig: ShopConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VtexOrdersClient.name);
  }

  async createOrder(shopId: string, payload: unknown) {
    const vtexConfig = await this.shopConfig.resolveVtexConfig(shopId);
    // Use Fulfillment API for external marketplace orders
    const url = `${this.baseUrl(vtexConfig)}/fulfillment/pvt/orders`;
    // Add sales channel query param (default to 1 or config)
    const sc = vtexConfig.salesChannel ?? '1';
    const affiliateId = vtexConfig.affiliateId;
    return firstValueFrom(this.http.post(url, payload, {
      headers: this.headers(vtexConfig),
      params: {
        sc,
        ...(affiliateId ? { affiliateId } : {}),
      },
    }));
  }

  async getOrder(shopId: string, orderId: string) {
    const vtexConfig = await this.shopConfig.resolveVtexConfig(shopId);
    const url = `${this.baseUrl(vtexConfig)}/oms/pvt/orders/${orderId}`;
    return firstValueFrom(this.http.get(url, { headers: this.headers(vtexConfig) }));
  }

  async simulateOrder(shopId: string, items: any[], postalCode: string, country: string) {
    const vtexConfig = await this.shopConfig.resolveVtexConfig(shopId);
    // Correct endpoint for simulation: /api/checkout/pub/orderForms/simulation
    const url = `${this.baseUrl(vtexConfig)}/checkout/pub/orderForms/simulation`;
    const sc = vtexConfig.salesChannel ?? '1';
    const affiliateId = vtexConfig.affiliateId;
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
    return firstValueFrom(this.http.post(url, payload, {
      headers: this.headers(vtexConfig),
      params: {
        sc,
        ...(affiliateId ? { affiliateId } : {}),
      },
    }));
  }

  async updateTracking(shopId: string, orderId: string, invoiceData: any) {
    const vtexConfig = await this.shopConfig.resolveVtexConfig(shopId);
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
    const url = `${this.baseUrl(vtexConfig)}/oms/pvt/orders/${orderId}/invoice`;
    return firstValueFrom(
      this.http.post(url, invoiceData, { headers: this.headers(vtexConfig) }),
    );
  }

  private baseUrl(config: VtexShopConfig): string {
    if (config.domain) {
      const base = config.domain.startsWith('http')
        ? config.domain
        : `https://${config.domain}`;
      return base.replace(/\/+$/, '') + '/api';
    }
    const suffix = config.environment.includes('.')
      ? config.environment
      : `${config.environment}.com`;
    return `https://${config.account}.${suffix}/api`;
  }

  private headers(config: VtexShopConfig) {
    const appKey = config.appKey;
    const appToken = config.appToken;
    return {
      'X-VTEX-API-AppKey': appKey,
      'X-VTEX-API-AppToken': appToken,
      'Content-Type': 'application/json',
    };
  }
}
