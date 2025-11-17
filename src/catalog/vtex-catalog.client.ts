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
    // quantidade de SKUs por página (padrão 50 se não definido em env)
    const pageSize = Number(this.configService.get('VTEX_PAGE_SIZE', { infer: true })) || 50;
    // limite de páginas a consultar (padrão 20 se não definido em env)
    const limit = Number(this.configService.get('VTEX_PAGE_LIMIT', { infer: true })) || 20;

    const results: string[] = [];

    // a paginação da VTEX começa em 1
    for (let currentPage = 1; currentPage <= limit; currentPage++) {
      const ids = await this.fetchSkuPage(currentPage, pageSize, updatedFrom);
      if (!ids.length) {
        break; // sem resultados, interrompe
      }
      results.push(...ids);
      if (ids.length < pageSize) {
        break; // última página, interrompe
      }
    }

    // mapeia cada id para um resumo de SKU (o productId será preenchido depois)
    return results.map((id) => ({ id: String(id), productId: String(id), name: '' }));
  }

  /**
   * Consulta uma página de SKUs usando o endpoint catalog_system/pvt/sku/stockkeepingunitids.
   * @param page número da página (iniciando em 1)
   * @param pageSize quantidade de registros por página
   * @param updatedFrom filtra SKUs atualizados após esta data (ISO 8601)
   */
  private async fetchSkuPage(
    page: number,
    pageSize: number,
    updatedFrom?: string,
  ): Promise<string[]> {
    const url = `${this.baseUrl()}/catalog_system/pvt/sku/stockkeepingunitids`;

    // parâmetros conforme documentação
    const params: Record<string, string> = {
      page: String(page),
      pagesize: String(pageSize),
    };
    if (updatedFrom) {
      // filtra por data de modificação
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

      // a API pode retornar vários formatos: array simples, wrapper "items", "data", etc.
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
        return body.data
          .map((item: any) => item?.id ?? item?.skuId)
          .filter(Boolean)
          .map(String);
      }
      if (typeof body === 'object' && body !== null) {
        // outras possíveis chaves de retorno: skus, result, pageItems
        const candidate = body.skus ?? body.result ?? body.pageItems;
        if (Array.isArray(candidate)) {
          return candidate
            .map((item: any) => item?.id ?? item?.skuId ?? item)
            .filter(Boolean)
            .map(String);
        }
      }

      // se não reconhecer o formato, registra um aviso e retorna vazio
      this.logger.warn(
        { page, pageSize, body },
        'VTEX listSkus returned unexpected payload; treating as empty result',
      );
      return [];
    } catch (error) {
      this.logger.error({ err: error, page, pageSize }, 'Failed to list VTEX SKUs');
      throw error;
    }
  }

  async getSkuInventory(skuId: string, warehouseId: string): Promise<number> {
    const url = `${this.baseUrl()}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;

    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.defaultHeaders() }),
    );

    return data?.totalQuantity ?? data?.quantity ?? 0;
  }

  async getSkuById(skuId: string): Promise<VtexSkuSummary> {
    const url = `${this.baseUrl()}/catalog/pvt/stockkeepingunit/${skuId}`;
    const { data } = await firstValueFrom(
      this.http.get<VtexSkuSummary>(url, { headers: this.defaultHeaders() }),
    );
    return data;
  }

  async getProductWithSkus(productId: string) {
    // endpoint correto segundo a documentação
    const url = `${this.baseUrl()}/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`;
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
    // a rota correta usa 'items', não 'skus'
    const url = `${this.baseUrl()}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;
    const { data } = await firstValueFrom(
      this.http.put(url, { quantity }, { headers: this.defaultHeaders() }),
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
