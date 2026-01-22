import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../common/config';
import { ShopConfigService, VtexShopConfig } from '../common/shop-config.service';

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
  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly shopConfigService: ShopConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async listSkus(shopId: string, updatedFrom?: string): Promise<VtexSkuSummary[]> {
    // quantidade de SKUs por pagina (padrao 50 se nao definido em env)
    const pageSize = Number(this.configService.get('VTEX_PAGE_SIZE', { infer: true })) || 50;
    // limite de paginas a consultar (padrao 20 se nao definido em env)
    const limit = Number(this.configService.get('VTEX_PAGE_LIMIT', { infer: true })) || 20;

    const results: string[] = [];

    // a paginacao da VTEX comeca em 1
    for (let currentPage = 1; currentPage <= limit; currentPage++) {
      const ids = await this.fetchSkuPage(shopId, currentPage, pageSize, updatedFrom);
      if (!ids.length) {
        break; // sem resultados, interrompe
      }
      results.push(...ids);
      if (ids.length < pageSize) {
        break; // ultima pagina, interrompe
      }
    }

    // mapeia cada id para um resumo de SKU (o productId sera preenchido depois)
    return results.map((id) => ({ id: String(id), productId: String(id), name: '' }));
  }

  /**
   * Consulta uma pagina de SKUs usando o endpoint catalog_system/pvt/sku/stockkeepingunitids.
   * @param page numero da pagina (iniciando em 1)
   * @param pageSize quantidade de registros por pagina
   * @param updatedFrom filtra SKUs atualizados apos esta data (ISO 8601)
   */
  private async fetchSkuPage(
    shopId: string,
    page: number,
    pageSize: number,
    updatedFrom?: string,
  ): Promise<string[]> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pvt/sku/stockkeepingunitids`;

    // parametros conforme documentacao
    const params: Record<string, string> = {
      page: String(page),
      pagesize: String(pageSize),
    };
    if (updatedFrom) {
      // filtra por data de modificacao
      params['lastModifiedDate'] = updatedFrom;
    }

    try {
      const response = await firstValueFrom(
        this.http.get(url, {
          params,
          headers: this.buildDefaultHeaders(vtexConfig),
          maxRedirects: 5,
        }),
      );
      const body = response.data;

      // a API pode retornar varios formatos: array simples, wrapper "items", "data", etc.
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
        // outras possiveis chaves de retorno: skus, result, pageItems
        const candidate = body.skus ?? body.result ?? body.pageItems;
        if (Array.isArray(candidate)) {
          return candidate
            .map((item: any) => item?.id ?? item?.skuId ?? item)
            .filter(Boolean)
            .map(String);
        }
      }

      // se nao reconhecer o formato, registra um aviso e retorna vazio
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

  async getSkuInventory(shopId: string, skuId: string, warehouseId: string): Promise<number> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;

    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );

    const parseQuantity = (value: unknown): number => {
      if (value === null || value === undefined) {
        return 0;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const extractQuantity = (payload: any): number => {
      if (!payload || typeof payload !== 'object') {
        return 0;
      }
      // Prioriza availableQuantity (estoque disponivel real)
      const candidates = [
        payload.availableQuantity,
        payload.totalQuantity,
        payload.quantity,
      ];
      for (const value of candidates) {
        if (value !== undefined && value !== null) {
          return parseQuantity(value);
        }
      }
      return 0;
    };

    if (Array.isArray(data)) {
      return data.reduce((sum, item) => sum + extractQuantity(item), 0);
    }

    if (data && typeof data === 'object') {
      return extractQuantity(data);
    }

    this.logger.warn(
      { skuId, warehouseId, body: data },
      'VTEX getSkuInventory returned unexpected payload; assuming zero quantity',
    );
    return 0;
  }

  async getSkuById(shopId: string, skuId: string): Promise<VtexSkuSummary> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/stockkeepingunit/${skuId}`;
    const { data } = await firstValueFrom(
      this.http.get<VtexSkuSummary>(url, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );
    return data;
  }

  async getProductWithSkus(shopId: string, productId: string) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    // endpoint correto segundo a documentacao
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`;
    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );
    return data;
  }

  async searchProductWithItems(shopId: string, productId: string) {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pub/products/search/`;
    const { data } = await firstValueFrom(
      this.http.get(url, {
        headers: this.buildDefaultHeaders(vtexConfig),
        params: {
          fq: `productId:${productId}`,
        },
      }),
    );
    return data;
  }

  async getProductById(shopId: string, productId: string): Promise<VtexProduct> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/product/${productId}`;
    const { data } = await firstValueFrom(
      this.http.get<VtexProduct>(url, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );
    return data;
  }

  async getPrice(shopId: string, skuId: string): Promise<number> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildPricingBaseUrl(vtexConfig)}/pricing/prices/${skuId}`;
    const { data } = await firstValueFrom(
      this.http.get<{ basePrice: number }>(url, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );
    return data.basePrice;
  }

  async setPrice(shopId: string, skuId: string, price: number): Promise<void> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildPricingBaseUrl(vtexConfig)}/pricing/prices/${skuId}`;
    await firstValueFrom(
      this.http.put(
        url,
        {
          listPrice: price,
          basePrice: price,
        },
        { headers: this.buildDefaultHeaders(vtexConfig) },
      ),
    );
  }

  async updateStock(
    shopId: string,
    skuId: string,
    warehouseId: string,
    quantity: number,
  ): Promise<{ quantity: number }> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    // a rota correta usa 'items', nao 'skus'
    const url = `${this.buildBaseUrl(vtexConfig)}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;
    const { data } = await firstValueFrom(
      this.http.put(url, { quantity }, { headers: this.buildDefaultHeaders(vtexConfig) }),
    );
    return data;
  }

  async getSkuImages(shopId: string, skuId: string): Promise<VtexSkuImage[]> {
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/stockkeepingunit/${skuId}/file`;
    const { data } = await firstValueFrom(
      this.http.get(url, {
        headers: this.buildDefaultHeaders(vtexConfig),
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
        url: this.buildVtexImageUrl(file, vtexConfig.account),
        isMain: Boolean(file?.IsMain) || file?.Position === 0,
        position: Number(file?.Position ?? 9999),
      }))
      .filter((image): image is VtexSkuImage => Boolean(image.url))
      .map((image) => ({
        url: image.url!,
        isMain: image.isMain,
        position: image.position,
      }));
  }

  private buildVtexImageUrl(file: any, account: string): string | undefined {
    const rawLocation =
      (typeof file?.FileLocation === 'string' && file.FileLocation) ||
      (typeof file?.fileLocation === 'string' && file.fileLocation) ||
      '';
    const formatted = this.normalizeFileLocation(rawLocation, account);
    if (formatted) {
      return formatted;
    }
    const fallback =
      (typeof file?.Url === 'string' && file.Url) ||
      (typeof file?.url === 'string' && file.url) ||
      '';
    return fallback?.trim() || undefined;
  }

  private normalizeFileLocation(location: string | undefined, account: string): string | undefined {
    if (!location) {
      return undefined;
    }
    const trimmed = location.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    const sanitized = trimmed.replace(/^\/+/, '');
    if (!sanitized) {
      return undefined;
    }
    const accountPrefix = `${account}.`;
    const prefixed = sanitized.startsWith(accountPrefix)
      ? sanitized
      : `${accountPrefix}${sanitized}`;
    return `https://${prefixed}`;
  }

  private buildBaseUrl(config: VtexShopConfig): string {
    if (config.domain) {
      const domain = config.domain.startsWith('http')
        ? config.domain
        : `https://${config.domain}`;
      return `${domain.replace(/\/+$/, '')}/api`;
    }
    const suffix = config.environment.includes('.')
      ? config.environment
      : `${config.environment}.com`;
    return `https://${config.account}.${suffix}/api`;
  }

  /**
   * Pricing API usa host api.vtex.com/{account}/..., sem o padrao account.environment.
   * Usamos override especifico (vtexPricingDomain) se informado.
   */
  private buildPricingBaseUrl(config: VtexShopConfig): string {
    if (config.pricingDomain) {
      const domain = config.pricingDomain.startsWith('http')
        ? config.pricingDomain
        : `https://${config.pricingDomain}`;
      return domain.replace(/\/+$/, '');
    }
    return `https://api.vtex.com/${config.account}`;
  }

  private buildDefaultHeaders(config: VtexShopConfig) {
    return {
      'X-VTEX-API-AppKey': config.appKey,
      'X-VTEX-API-AppToken': config.appToken,
      'Content-Type': 'application/json',
    };
  }
}
