import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { ShopConfigService, VtexShopConfig } from '../common/shop-config.service';

@Injectable()
export class VtexOrdersClient {
  constructor(
    private readonly http: HttpService,
    private readonly shopConfigService: ShopConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VtexOrdersClient.name);
  }

  async createOrder(shopId: string, payload: unknown) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    // Use Fulfillment API for external marketplace orders
    const url = `${this.buildBaseUrl(vtexConfig)}/fulfillment/pvt/orders`;
    // Add sales channel query param (default to 1 or config)
    const sc = vtexConfig.salesChannel;
    const affiliateId = vtexConfig.affiliateId;
    return firstValueFrom(
      this.http.post(url, payload, {
        headers: this.buildHeaders(vtexConfig),
        params: {
          sc,
          ...(affiliateId ? { affiliateId } : {}),
        },
      }),
    );
  }

  async getOrder(shopId: string, orderId: string) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/oms/pvt/orders/${orderId}`;
    return firstValueFrom(this.http.get(url, { headers: this.buildHeaders(vtexConfig) }));
  }

  async simulateOrder(shopId: string, items: any[], postalCode: string, country: string) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    // Correct endpoint for simulation: /api/checkout/pub/orderForms/simulation
    const url = `${this.buildBaseUrl(vtexConfig)}/checkout/pub/orderForms/simulation`;
    const sc = vtexConfig.salesChannel;
    const affiliateId = vtexConfig.affiliateId;
    const payloadItems = items.map((item) => {
      const entry: Record<string, unknown> = {
        id: item.id,
        quantity: item.quantity,
      };
      if (item.seller !== undefined && item.seller !== null && item.seller !== '') {
        entry.seller = item.seller;
      }
      return entry;
    });
    const payload = {
      items: payloadItems,
      postalCode,
      country,
    };
    this.logger.info(
      { url, payload, params: { sc, affiliateId: affiliateId ?? null } },
      'Calling VTEX simulation endpoint',
    );
    return firstValueFrom(
      this.http.post(url, payload, {
        headers: this.buildHeaders(vtexConfig),
        params: {
          sc,
          ...(affiliateId ? { affiliateId } : {}),
        },
      }),
    );
  }

  async updateTracking(shopId: string, orderId: string, invoiceData: any) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
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
    const url = `${this.buildBaseUrl(vtexConfig)}/oms/pvt/orders/${orderId}/invoice`;
    return firstValueFrom(
      this.http.post(url, invoiceData, { headers: this.buildHeaders(vtexConfig) }),
    );
  }

  async fetchInvoiceFile(shopId: string, invoiceUrl: string): Promise<string | null> {
    if (!invoiceUrl) {
      return null;
    }
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const headers = this.buildHeaders(vtexConfig);
    const baseUrl = this.buildBaseUrl(vtexConfig).replace(/\/api$/, '');
    const url = invoiceUrl.startsWith('http') ? invoiceUrl : `${baseUrl}${invoiceUrl}`;

    const response = await firstValueFrom(
      this.http.get(url, {
        headers,
        responseType: 'text',
      }),
    );

    if (typeof response.data === 'string') {
      return response.data;
    }

    if (response.data && Buffer.isBuffer(response.data)) {
      return response.data.toString('utf8');
    }

    return null;
  }

  async authorizeDispatch(shopId: string, orderId: string) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/fulfillment/pvt/orders/${orderId}/fulfill`;
    return firstValueFrom(
      this.http.post(url, null, { headers: this.buildHeaders(vtexConfig) }),
    );
  }

  private buildBaseUrl(config: VtexShopConfig): string {
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

  private buildHeaders(config: VtexShopConfig) {
    return {
      'X-VTEX-API-AppKey': config.appKey,
      'X-VTEX-API-AppToken': config.appToken,
      'Content-Type': 'application/json',
    };
  }
}
