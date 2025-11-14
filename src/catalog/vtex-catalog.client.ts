import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';

export interface VtexSkuSummary {
  id: string;
  productId: string;
  name: string;
  Name?: string;
  refId?: string;
  RefId?: string;
  ean?: string;
  isActive?: boolean;
  dimensions?: Record<string, unknown>;
  StockBalance?: number;
  stockBalance?: number;
  description?: string;
  Description?: string;
  brandName?: string;
  BrandName?: string;
  ProductId?: string;
  ParentProductId?: string;
  Ean?: string;
  EAN?: string;
  MeasurementUnit?: string;
  UnitMultiplier?: number;
  WeightKg?: number;
  RealWeightKg?: number;
  CubicWeightKg?: number;
  Height?: number;
  Width?: number;
  Length?: number;
  Dimension?: {
    height?: number;
    width?: number;
    length?: number;
  };
  PackedHeight?: number;
  PackedLength?: number;
  PackedWidth?: number;
  PackedWeightKg?: number;
}

export interface VtexProduct {
  Id: number;
  Name: string;
  Description?: string;
  CategoryId?: number;
  BrandId?: number;
  BrandName?: string;
  RefId?: string;
  Title?: string;
  MetaTagDescription?: string;
  IsActive?: boolean;
  TaxCode?: string;
}

export interface VtexSkuImage {
  url: string;
  isMain: boolean;
  position: number;
}

@Injectable()
export class VtexCatalogClient {
  private readonly account: string;
  private readonly environment: string;
  private readonly domainOverride?: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly logger: PinoLogger,
  ) {
    this.account = this.configService.getOrThrow<string>('VTEX_ACCOUNT', { infer: true });
    this.environment = this.configService.getOrThrow<string>('VTEX_ENVIRONMENT', { infer: true });
    this.domainOverride = this.configService.get<string>('VTEX_DOMAIN', { infer: true });
  }

  async listSkus(updatedFrom?: string): Promise<VtexSkuSummary[]> {
    const pageSize = Number(this.configService.get('VTEX_PAGE_SIZE', { infer: true })) || 50;
    const limit = Number(this.configService.get('VTEX_PAGE_LIMIT', { infer: true })) || 20;

    const results: string[] = [];
    let page = 0;

    while (page < limit) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const ids = await this.fetchSkuRange(from, to, updatedFrom);
      if (!ids.length) {
        break;
      }
      results.push(...ids);
      if (ids.length < pageSize) {
        break;
      }
      page += 1;
    }

    return results.map((id) => ({ id: String(id), productId: String(id), name: '' }));
  }

  private async fetchSkuRange(
    from: number,
    to: number,
    updatedFrom?: string,
  ): Promise<string[]> {
    const url = `${this.baseUrl()}/catalog_system/pvt/sku/stockkeepingunitids`;
    const params: Record<string, string> = {
      from: String(from),
      to: String(to),
      page: String(Math.floor(from / Math.max(to - from + 1, 1)) + 1),
      pageSize: String(to - from + 1),
    };
    if (updatedFrom) {
      params['lastModifiedDate'] = updatedFrom;
    }

    try {
      const response = await firstValueFrom(
        this.http.get(url, {
          params,
          headers: this.defaultHeaders(),
          maxRedirects: 5,
        }),
      );

      const body = response.data;
      if (Array.isArray(body)) {
        return body.map(String);
      }
      if (Array.isArray(body?.items)) {
        return body.items
          .map((item: any) => (typeof item === 'object' ? item?.id ?? item?.skuId : item))
          .filter(Boolean)
          .map(String);
      }
      if (Array.isArray(body?.data)) {
        return body.data.map((item: any) => item?.id ?? item?.skuId).filter(Boolean).map(String);
      }
      if (typeof body === 'object' && body !== null) {
        const candidate = body.skus ?? body.result ?? body.pageItems;
        if (Array.isArray(candidate)) {
          return candidate
            .map((item: any) => item?.id ?? item?.skuId ?? item)
            .filter(Boolean)
            .map(String);
        }
      }

      this.logger.warn(
        { from, to, body },
        'VTEX listSkus returned unexpected payload; treating as empty result',
      );
      return [];
    } catch (error) {
      this.logger.error({ err: error, from, to }, 'Failed to list VTEX SKUs');
      throw error;
    }
  }

  async getSkuById(skuId: string): Promise<VtexSkuSummary> {
    const url = `${this.baseUrl()}/catalog/pvt/stockkeepingunit/${skuId}`;
    const { data } = await firstValueFrom(
      this.http.get<VtexSkuSummary>(url, { headers: this.defaultHeaders() }),
    );
    return data;
  }

  async getProductWithSkus(productId: string) {
    const url = `${this.baseUrl()}/catalog/pvt/product/${productId}/skus`;
    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.defaultHeaders() }),
    );
    return data;
  }

  async searchProductWithItems(productId: string) {
    const url = `${this.baseUrl()}/catalog_system/pub/products/search/`;
    const { data } = await firstValueFrom(
      this.http.get(url, {
        headers: this.defaultHeaders(),
        params: {
          fq: `productId:${productId}`,
        },
      }),
    );
    return data;
  }

  async getProductById(productId: string): Promise<VtexProduct> {
    const url = `${this.baseUrl()}/catalog/pvt/product/${productId}`;
    const { data } = await firstValueFrom(
      this.http.get<VtexProduct>(url, { headers: this.defaultHeaders() }),
    );
    return data;
  }

  async getPrice(skuId: string): Promise<number> {
    const url = `${this.baseUrl()}/pricing/prices/${skuId}`;
    const { data } = await firstValueFrom(
      this.http.get<{ basePrice: number }>(url, { headers: this.defaultHeaders() }),
    );
    return data.basePrice;
  }

  async setPrice(skuId: string, price: number): Promise<void> {
    const url = `${this.baseUrl()}/pricing/prices/${skuId}`;
    await firstValueFrom(
      this.http.put(
        url,
        {
          listPrice: price,
          basePrice: price,
        },
        { headers: this.defaultHeaders() },
      ),
    );
  }

  async updateStock(
    skuId: string,
    warehouseId: string,
    quantity: number,
  ): Promise<{ quantity: number }> {
    const url = `${this.baseUrl()}/logistics/pvt/inventory/skus/${skuId}/warehouses/${warehouseId}`;
    const { data } = await firstValueFrom(
      this.http.put<{ quantity: number }>(
        url,
        { quantity },
        { headers: this.defaultHeaders() },
      ),
    );

    return data;
  }

  async getSkuImages(skuId: string): Promise<VtexSkuImage[]> {
    const url = `${this.baseUrl()}/catalog/pvt/stockkeepingunit/${skuId}/file`;
    const { data } = await firstValueFrom(
      this.http.get(url, {
        headers: this.defaultHeaders(),
      }),
    );

    if (!Array.isArray(data)) {
      this.logger.warn(
        { skuId, body: data },
        'VTEX getSkuImages returned unexpected payload; returning empty list',
      );
      return [];
    }

    return data
      .map((file: any) => ({
        url: file?.Url ?? file?.url,
        isMain: Boolean(file?.IsMain) || file?.Position === 0,
        position: Number(file?.Position ?? 9999),
      }))
      .filter((image: VtexSkuImage) => Boolean(image.url));
  }

  private baseUrl(): string {
    if (this.domainOverride) {
      const domain = this.domainOverride.startsWith('http')
        ? this.domainOverride
        : `https://${this.domainOverride}`;
      return `${domain.replace(/\/+$/, '')}/api`;
    }
    const suffix = this.environment.includes('.')
      ? this.environment
      : `${this.environment}.com`;
    return `https://${this.account}.${suffix}/api`;
  }

  private defaultHeaders() {
    const appKey = this.configService.getOrThrow<string>('VTEX_APP_KEY', { infer: true });
    const appToken = this.configService.getOrThrow<string>('VTEX_APP_TOKEN', { infer: true });
    return {
      'X-VTEX-API-AppKey': appKey,
      'X-VTEX-API-AppToken': appToken,
      'Content-Type': 'application/json',
    };
  }
}
