import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
import { buildSignedQuery } from '../common/signer';
import {
  VtexProduct,
  VtexSkuImage,
  VtexSkuSummary,
} from './vtex-catalog.client';

export interface TiktokProductInput {
  vtexSkuId: string;
  sku: VtexSkuSummary;
  product: VtexProduct;
  price: number;
  quantity: number;
  images: VtexSkuImage[];
}

export interface TiktokProductResponse {
  productId: string | null;
  skuId: string | null;
  raw: any;
}

@Injectable()
export class TiktokProductClient {
  private readonly openBase: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly shopCipher: string;
  private readonly shopId?: string;
  private readonly categoryId: string;
  private readonly brandId?: string;
  private readonly brandName?: string;
  private readonly warehouseId: string;
  private readonly currency: string;
  private readonly saveMode: string;
  private readonly fallbackDescription: string;
  private readonly packageWeight?: number;
  private readonly packageWeightUnit: string;
  private readonly packageLength?: number;
  private readonly packageWidth?: number;
  private readonly packageHeight?: number;
  private readonly packageDimensionUnit: string;
  private readonly minimumOrderQuantity?: number;
  private readonly listingPlatforms?: string[];
  private readonly imageUriCache = new Map<string, string>();

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly tiktokShopService: TiktokShopService,
    private readonly logger: PinoLogger,
  ) {
    this.openBase = this.normalizeBaseUrl(
      this.configService.getOrThrow<string>('TIKTOK_BASE_OPEN', { infer: true }),
    );
    this.appKey = this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true });
    this.appSecret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
    this.shopCipher = this.configService.getOrThrow<string>('TIKTOK_SHOP_CIPHER', { infer: true });
    this.shopId = this.configService.get<string>('TIKTOK_SHOP_ID', { infer: true });
    this.categoryId = this.configService.getOrThrow<string>('TIKTOK_DEFAULT_CATEGORY_ID', {
      infer: true,
    });
    this.brandId = this.configService.get<string>('TIKTOK_BRAND_ID', { infer: true });
    this.brandName = this.configService.get<string>('TIKTOK_BRAND_NAME', { infer: true });
    this.warehouseId = this.configService.getOrThrow<string>('TIKTOK_WAREHOUSE_ID', {
      infer: true,
    });
    this.currency = this.configService.get<string>('TIKTOK_CURRENCY', { infer: true }) ?? 'BRL';
    this.saveMode = this.configService.get<string>('TIKTOK_SAVE_MODE', { infer: true }) ?? 'LISTING';
    this.fallbackDescription =
      this.configService.get<string>('TIKTOK_DESCRIPTION_FALLBACK', { infer: true }) ??
      'No description provided.';
    this.packageWeight = this.configService.get<number>('TIKTOK_PACKAGE_WEIGHT', { infer: true });
    this.packageWeightUnit =
      this.configService.get<string>('TIKTOK_PACKAGE_WEIGHT_UNIT', { infer: true }) ?? 'KILOGRAM';
    this.packageLength = this.configService.get<number>('TIKTOK_PACKAGE_LENGTH', { infer: true });
    this.packageWidth = this.configService.get<number>('TIKTOK_PACKAGE_WIDTH', { infer: true });
    this.packageHeight = this.configService.get<number>('TIKTOK_PACKAGE_HEIGHT', { infer: true });
    this.packageDimensionUnit =
      this.configService.get<string>('TIKTOK_PACKAGE_DIMENSION_UNIT', { infer: true }) ??
      'CENTIMETER';
    this.minimumOrderQuantity = this.configService.get<number>(
      'TIKTOK_MINIMUM_ORDER_QUANTITY',
      { infer: true },
    );
    const listingPlatforms = this.configService.get<string[]>(
      'TIKTOK_LISTING_PLATFORMS',
      { infer: true },
    );
    this.listingPlatforms = Array.isArray(listingPlatforms) ? listingPlatforms : undefined;
    this.logger.setContext(TiktokProductClient.name);
  }

  async createProduct(shopId: string, input: TiktokProductInput): Promise<TiktokProductResponse> {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);
    const payload = await this.buildProductPayload(shopId, accessToken, input);

    // IMPORTANTE: incluir o body na assinatura
    const url = this.buildSignedUrl('/product/202309/products', {
      body: payload,
    });

    const headers = this.buildHeaders(accessToken);
    const response = await firstValueFrom(this.http.post(url, payload, { headers }));
    return this.parseProductResponse(response.data);
  }

  async updateProduct(
    shopId: string,
    productId: string,
    input: TiktokProductInput,
  ): Promise<TiktokProductResponse> {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);
    const payload = await this.buildProductPayload(shopId, accessToken, input, { productId });

    // path com o productId faz parte do stringToSign
    const path = `/product/202309/products/${productId}`;
    const url = this.buildSignedUrl(path, {
      body: payload,
    });

    const headers = this.buildHeaders(accessToken);
    const response = await firstValueFrom(this.http.put(url, payload, { headers }));
    return this.parseProductResponse(response.data);
  }

  async updateStock(
    shopId: string,
    warehouseId: string,
    skuId: string,
    availableQuantity: number,
  ) {
    return this.legacyRequest(shopId, 'post', '/api/warehouse/stock/update', {
      warehouse_id: warehouseId,
      products: [
        {
          sku_id: skuId,
          available_stock: availableQuantity,
        },
      ],
    });
  }

  private async legacyRequest(
    shopId: string,
    method: 'get' | 'post' | 'put',
    path: string,
    payload?: unknown,
  ) {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);
    const url = `${this.openBase}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
      Authorization: `Bearer ${accessToken}`,
    };

    switch (method) {
      case 'get':
        return firstValueFrom(this.http.get(url, { headers }));
      case 'post':
        return firstValueFrom(this.http.post(url, payload, { headers }));
      case 'put':
        return firstValueFrom(this.http.put(url, payload, { headers }));
      default:
        throw new Error(`Unsupported method ${method}`);
    }
  }

  /**
   * Monta URL com assinatura correta.
   * `body` é usado na assinatura quando for POST/PUT.
   */
  private buildSignedUrl(
    path: string,
    options: {
      extraParams?: Record<string, string | number | boolean | undefined>;
      includeShopCipher?: boolean;
      includeShopId?: boolean;
      body?: any;
    } = {},
  ): string {
    const params: Record<string, string | number | boolean | undefined> = {
      ...(options.extraParams ?? {}),
    };

    // Por padrão incluímos shop_cipher e shop_id (exigidos nos endpoints de product)
    if (options.includeShopCipher !== false) {
      params.shop_cipher = this.shopCipher;
    }
    if (options.includeShopId !== false && this.shopId) {
      params.shop_id = this.shopId;
    }

    // buildSignedQuery já adiciona app_key, sign_method e timestamp internamente
    const query = buildSignedQuery(this.appKey, this.appSecret, path, params, options.body);
    return `${this.openBase}${path}?${query.toString()}`;
  }

  private buildHeaders(accessToken: string) {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-tts-access-token': accessToken,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private normalizeBaseUrl(url: string) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private parseProductResponse(data: any): TiktokProductResponse {
    const productId = data?.data?.product_id ?? data?.product_id ?? null;
    const skuId =
      data?.data?.skus?.[0]?.id ??
      data?.data?.sku_id ??
      data?.skus?.[0]?.id ??
      null;
    return {
      productId,
      skuId,
      raw: data,
    };
  }

  private async buildProductPayload(
    shopId: string,
    accessToken: string,
    input: TiktokProductInput,
    options: { productId?: string } = {},
  ) {
    const images = await this.prepareImages(shopId, accessToken, input.images);
    const priceAmount = this.formatPrice(input.price);
    const quantity = Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0);
    const brandId =
      this.brandId ?? (input.product.BrandId ? String(input.product.BrandId) : undefined);
    const brandName =
      this.brandName ?? input.product.BrandName ?? input.sku.BrandName ?? 'Generic';
    const categoryId =
      this.categoryId ?? (input.product.CategoryId ? String(input.product.CategoryId) : undefined);

    if (!categoryId) {
      throw new Error('Unable to determine TikTok category_id for product');
    }

    const description = this.buildDescription(input);
    const price = {
      amount: priceAmount,
      currency: this.currency,
      sale_price: priceAmount,
    };
    const inventory = [
      {
        warehouse_id: this.warehouseId,
        quantity: Math.floor(quantity).toString(),
      },
    ];
    const identifierCode = this.buildIdentifierCode(input.sku);
    const skuImgUri = images[0]?.uri;
    const supplementarySkuImages = images.slice(1).map((image) => ({ uri: image.uri }));

    const skuPayload: Record<string, unknown> = {
      seller_sku: String(input.vtexSkuId),
      external_sku_id: String(
        (input.sku as any).RefId ?? input.sku.refId ?? input.vtexSkuId,
      ),
      price,
      inventory,
      identifier_code: identifierCode,
      sku_img: skuImgUri ? { uri: skuImgUri } : undefined,
      supplementary_sku_images:
        supplementarySkuImages.length > 0 ? supplementarySkuImages : undefined,
      sales_attributes: this.buildSalesAttributes(input),
      sku_unit_count: this.buildSkuUnitCount(input.sku),
    };

    const payload: Record<string, unknown> = {
      save_mode: this.saveMode,
      title: this.buildTitle(input),
      description,
      category_id: categoryId,
      brand_id: brandId,
      brand_name: brandName,
      main_images: images.map((image) => ({ uri: image.uri })),
      skus: [this.cleanPayload(skuPayload)],
      product_attributes: this.buildProductAttributes(input),
      package_dimensions: this.buildPackageDimensions(input),
      package_weight: this.buildPackageWeight(input),
      is_cod_allowed: false,
      is_pre_owned: false,
      idempotency_key: `vtex-${shopId}-${input.vtexSkuId}`,
      minimum_order_quantity: this.minimumOrderQuantity,
      listing_platforms: this.listingPlatforms,
    };

    if (!brandId) {
      delete payload.brand_id;
    }
    if (!brandName) {
      delete payload.brand_name;
    }
    if (!this.minimumOrderQuantity) {
      delete payload.minimum_order_quantity;
    }
    if (!this.listingPlatforms || this.listingPlatforms.length === 0) {
      delete payload.listing_platforms;
    }
    if (options.productId) {
      payload.product_id = options.productId;
    }

    return this.cleanPayload(payload);
  }

  private async prepareImages(
    shopId: string,
    accessToken: string,
    images: VtexSkuImage[],
  ): Promise<Array<{ uri: string }>> {
    if (!images.length) {
      return [];
    }
    const sorted = [...images].sort((a, b) => a.position - b.position);
    const uris: string[] = [];

    for (const image of sorted) {
      const uri = await this.ensureImageUri(shopId, accessToken, image.url);
      if (uri) {
        uris.push(uri);
      }
    }

    if (uris.length === 0) {
      throw new Error('Unable to upload any product images to TikTok');
    }

    return uris.map((uri) => ({ uri }));
  }

  private async ensureImageUri(
    shopId: string,
    accessToken: string,
    imageUrl: string,
  ): Promise<string | null> {
    const normalized = imageUrl?.trim();
    if (!normalized) {
      return null;
    }

    if (this.imageUriCache.has(normalized)) {
      return this.imageUriCache.get(normalized) ?? null;
    }

    try {
      const body = {
        image_url: normalized,
      };

      const url = this.buildSignedUrl('/product/202309/images/upload', {
        includeShopCipher: false,
        includeShopId: false,
        body,
      });

      const headers = this.buildHeaders(accessToken);
      const response = await firstValueFrom(
        this.http.post(
          url,
          body,
          { headers },
        ),
      );

      const uri =
        response.data?.data?.uri ??
        response.data?.data?.image?.uri ??
        response.data?.uri ??
        null;

      if (!uri) {
        throw new Error('TikTok image upload did not return a URI');
      }

      this.imageUriCache.set(normalized, uri);
      return uri;
    } catch (error) {
      const errorPayload = (error as any)?.response?.data;
      this.logger.error(
        { err: error, errorPayload, imageUrl: normalized },
        'Failed to upload image to TikTok',
      );
      return null;
    }
  }

  private buildDescription(input: TiktokProductInput): string {
    const description =
      input.product.Description ??
      input.product.MetaTagDescription ??
      (input.sku as any)?.Description ??
      this.fallbackDescription;
    return description.toString().trim() || this.fallbackDescription;
  }

  private buildTitle(input: TiktokProductInput): string {
    return (
      input.product.Title ??
      input.product.Name ??
      input.sku.name ??
      `SKU ${input.vtexSkuId}`
    );
  }

  private buildIdentifierCode(sku: VtexSkuSummary) {
    const ean = (sku.EAN ?? sku.Ean ?? (sku as any)?.ean ?? '').toString().trim();
    if (!ean) {
      return undefined;
    }
    return {
      code: ean,
      type: 'GTIN',
    };
  }

  private buildSkuUnitCount(sku: VtexSkuSummary) {
    if (!sku.UnitMultiplier || Number.isNaN(Number(sku.UnitMultiplier))) {
      return undefined;
    }
    return Number(sku.UnitMultiplier).toString();
  }

  private buildSalesAttributes(_input: TiktokProductInput) {
    // VTEX specifications could be mapped here. For now, we return an empty array.
    return [];
  }

  private buildProductAttributes(_input: TiktokProductInput) {
    return [];
  }

  private buildPackageDimensions(input: TiktokProductInput) {
    const fallbackLength = this.packageLength ?? 10;
    const fallbackWidth = this.packageWidth ?? 10;
    const fallbackHeight = this.packageHeight ?? 10;

    const length =
      this.extractDimension(input.sku.PackedLength ?? input.sku.Length) ?? fallbackLength;
    const width = this.extractDimension(input.sku.PackedWidth ?? input.sku.Width) ?? fallbackWidth;
    const height =
      this.extractDimension(input.sku.PackedHeight ?? input.sku.Height) ?? fallbackHeight;

    return this.cleanPayload({
      length: this.formatNumber(length),
      width: this.formatNumber(width),
      height: this.formatNumber(height),
      unit: this.packageDimensionUnit,
    });
  }

  private buildPackageWeight(input: TiktokProductInput) {
    const weight =
      this.extractWeight(input.sku.PackedWeightKg ?? input.sku.WeightKg ?? input.sku.RealWeightKg) ??
      this.packageWeight ??
      1;

    return this.cleanPayload({
      value: this.formatNumber(weight),
      unit: this.packageWeightUnit,
    });
  }

  private extractDimension(value?: number | string) {
    if (value === undefined || value === null) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
  }

  private extractWeight(value?: number | string) {
    if (value === undefined || value === null) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
  }

  private formatPrice(price: number) {
    return Number(price || 0)
      .toFixed(2)
      .toString();
  }

  private formatNumber(value: number) {
    return Number(value || 0)
      .toFixed(2)
      .toString();
  }

  private cleanPayload<T extends Record<string, unknown>>(payload: T): T {
    const clone: Record<string, unknown> = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        const cleaned = value
          .map((item) =>
            typeof item === 'object' && item !== null ? this.cleanPayload(item as any) : item,
          )
          .filter((item) => item !== undefined && item !== null);
        if (cleaned.length > 0) {
          clone[key] = cleaned;
        }
        return;
      }
      if (typeof value === 'object') {
        const cleaned = this.cleanPayload(value as Record<string, unknown>);
        if (Object.keys(cleaned).length > 0) {
          clone[key] = cleaned;
        }
        return;
      }
      clone[key] = value;
    });
    return clone as T;
  }
}
