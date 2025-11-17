// src/catalog/tiktok-product.client.ts
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
import { buildSignedRequest } from '../common/signer';
import { VtexProduct, VtexSkuImage, VtexSkuSummary } from './vtex-catalog.client';
import * as FormData from 'form-data';

export interface TiktokProductInput {
  product: VtexProduct;
  skus: TiktokProductSkuInput[];
}

export interface TiktokProductSkuInput {
  vtexSkuId: string;
  sku: VtexSkuSummary;
  price: number;
  quantity: number;
  images: VtexSkuImage[];
  sizeLabel?: string;
  ttsSkuId?: string | null;
}

export interface TiktokProductResponse {
  productId: string | null;
  skuIds: Record<string, string>;
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
    this.saveMode =
      this.configService.get<string>('TIKTOK_SAVE_MODE', { infer: true }) ?? 'LISTING';
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

  async createProduct(
    shopId: string,
    input: TiktokProductInput,
  ): Promise<TiktokProductResponse> {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);
    const payload = await this.buildProductPayload(shopId, accessToken, input);

    this.logger.info(
      {
        shopId,
        vtexProductId: input.product.Id,
        skuCount: input.skus.length,
      },
      'Creating product on TikTok',
    );

    const { url, headers, body } = this.buildSignedOpenApiRequest(
      '/product/202309/products',
      accessToken,
      payload,
    );

    const response = await firstValueFrom(this.http.post(url, body, { headers }));
    const parsed = this.parseProductResponse(response.data);

    const code = response.data?.code;
    const message = response.data?.message;

    if (code !== undefined && code !== 0) {
      throw new Error(
        `TikTok createProduct failed: code=${code} message=${message ?? 'Unknown'}`,
      );
    }

    if (!parsed.productId || !Object.keys(parsed.skuIds).length) {
      throw new Error(
        `TikTok createProduct did not return product_id/sku_id for vtexProductId=${input.product.Id}`,
      );
    }

    this.logger.info(
      {
        shopId,
        ttsProductId: parsed.productId,
        skuCount: Object.keys(parsed.skuIds).length,
      },
      'Successfully created TikTok product',
    );

    return parsed;
  }


  async updateProduct(
    shopId: string,
    productId: string,
    input: TiktokProductInput,
  ): Promise<TiktokProductResponse> {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);
    const payload = await this.buildProductPayload(shopId, accessToken, input, { productId });

    this.logger.info(
      {
        shopId,
        productId,
        vtexProductId: input.product.Id,
        skuCount: input.skus.length,
      },
      'Updating product on TikTok',
    );

    const { url, headers, body } = this.buildSignedOpenApiRequest(
      `/product/202309/products/${productId}`,
      accessToken,
      payload,
    );

    const response = await firstValueFrom(this.http.put(url, body, { headers }));
    const parsed = this.parseProductResponse(response.data);

    const code = response.data?.code;
    const message = response.data?.message;

    if (code !== undefined && code !== 0) {
      throw new Error(
        `TikTok updateProduct failed: code=${code} message=${message ?? 'Unknown'}`,
      );
    }

    if (!parsed.productId || !Object.keys(parsed.skuIds).length) {
      this.logger.warn(
        {
          shopId,
          productId,
          vtexProductId: input.product.Id,
          raw: response.data,
        },
        'TikTok updateProduct did not return product_id/sku_id, keeping existing mapping',
      );
    } else {
      this.logger.info(
        {
          shopId,
          ttsProductId: parsed.productId,
          skuCount: Object.keys(parsed.skuIds).length,
        },
        'Successfully updated TikTok product',
      );
    }

    return parsed;
  }

  async updateStock(
    shopId: string,
    _warehouseId: string, // ignoramos o warehouse da VTEX; usamos sempre o da TikTok
    ttsSkuId: string,
    availableQuantity: number,
    ttsProductId: string,
  ): Promise<void> {
    const accessToken = await this.tiktokShopService.getAccessToken(shopId);

    const inventoryItem = {
      warehouse_id: this.warehouseId, // sempre o warehouse da TikTok, vindo do .env
      quantity: Math.max(0, Math.floor(availableQuantity)),
    };

    const body = {
      skus: [
        {
          id: String(ttsSkuId),
          inventory: [inventoryItem],
        },
      ],
    };

    const { url, headers, body: signedBody } = this.buildSignedOpenApiRequest(
      `/product/202309/products/${ttsProductId}/inventory/update`,
      accessToken,
      body,
    );

    const response = await firstValueFrom(
      this.http.post(url, signedBody, { headers }),
    );

    const code = response.data?.code;
    if (code !== undefined && code !== 0) {
      const message = response.data?.message ?? 'Unknown';
      throw new Error(
        `TikTok inventory update failed: code=${code} message=${message}`,
      );
    }
  }
  
  /**
   * Cria a request assinada para os endpoints OpenAPI (202309),
   * seguindo o fluxo da doc de assinatura.
   */
  private buildSignedOpenApiRequest(
    path: string,
    accessToken: string,
    body?: any,
    options: {
      extraParams?: Record<string, any>;
      includeShopCipher?: boolean;
      includeShopId?: boolean;
    } = {},
  ) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      Accept: 'application/json',
      'x-tts-access-token': accessToken,
      Authorization: `Bearer ${accessToken}`,
    };

    const qs: Record<string, any> = {
      ...(options.extraParams ?? {}),
    };

    // shop_cipher por padrão (requisitado em vários endpoints de produto)
    if (options.includeShopCipher !== false && this.shopCipher) {
      qs.shop_cipher = this.shopCipher;
    }

    // shop_id opcional, mas costuma ser útil
    if (options.includeShopId !== false && this.shopId) {
      qs.shop_id = this.shopId;
    }

    return buildSignedRequest(this.openBase, path, this.appKey, this.appSecret, {
      qs,
      headers,
      body,
    });
  }

  private buildAccessHeaders(accessToken: string) {
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
    const code = data?.code;
    const message = data?.message;

    const productId =
      data?.data?.product_id ??
      data?.product_id ??
      null;

    const skuNodes =
      (Array.isArray(data?.data?.skus) && data.data.skus) ??
      (Array.isArray(data?.skus) && data.skus) ??
      [];

    const skuIds: Record<string, string> = {};

    if (Array.isArray(skuNodes)) {
      for (const sku of skuNodes) {
        const sellerSku =
          sku?.seller_sku ??
          sku?.sellerSku ??
          sku?.external_sku_id ??
          sku?.externalSkuId ??
          sku?.seller_id;
        const skuIdValue = sku?.id ?? sku?.sku_id ?? sku?.skuId;
        if (sellerSku && skuIdValue) {
          skuIds[String(sellerSku)] = String(skuIdValue);
        }
      }
    }

    if (!Object.keys(skuIds).length) {
      const fallbackSkuId =
        data?.data?.sku_id ??
        data?.sku_id ??
        null;
      const fallbackSellerSku =
        (Array.isArray(data?.data?.skus) && data?.data?.skus?.[0]?.seller_sku) ??
        data?.data?.seller_sku ??
        data?.seller_sku ??
        null;
      if (fallbackSkuId && fallbackSellerSku) {
        skuIds[String(fallbackSellerSku)] = String(fallbackSkuId);
      }
    }

    if (code !== undefined && code !== 0) {
      this.logger.error(
        { code, message, raw: data },
        'TikTok product API returned non-zero code',
      );
    } else if (!productId || !Object.keys(skuIds).length) {
      // Mesmo com code == 0, se não vier id é estranho
      this.logger.warn(
        { raw: data },
        'TikTok product API did not return product_id / sku ids',
      );
    }

    return {
      productId,
      skuIds,
      raw: data,
    };
  }


  private async buildProductPayload(
    shopId: string,
    accessToken: string,
    input: TiktokProductInput,
    options: { productId?: string } = {},
  ) {
    if (!input.skus.length) {
      throw new Error('Cannot build TikTok product payload without SKUs');
    }

    const primarySku = input.skus[0];
    const brandId =
      this.brandId ?? (input.product.BrandId ? String(input.product.BrandId) : undefined);
    const brandName =
      this.brandName ??
      input.product.BrandName ??
      primarySku.sku.BrandName ??
      'Generic';
    const categoryId =
      this.categoryId ??
      (input.product.CategoryId ? String(input.product.CategoryId) : undefined);

    if (!categoryId) {
      throw new Error('Unable to determine TikTok category_id for product');
    }

    const mainImageUris = new Map<string, { uri: string }>();
    const skuPayloads: Array<Record<string, unknown>> = [];

    for (const skuInput of input.skus) {
      const priceAmount = this.formatPrice(skuInput.price);
      const quantity = Math.max(
        0,
        Number.isFinite(skuInput.quantity) ? skuInput.quantity : 0,
      );
      const inventory = [
        {
          warehouse_id: this.warehouseId,
          quantity: Math.floor(quantity),
        },
      ];
      const identifierCode = this.buildIdentifierCode(skuInput.sku);
      const preparedImages = await this.prepareImages(
        shopId,
        accessToken,
        skuInput.images,
      );

      for (const image of preparedImages) {
        if (!mainImageUris.has(image.uri)) {
          mainImageUris.set(image.uri, { uri: image.uri });
        }
      }

      const skuImgUri = preparedImages[0]?.uri;
      const supplementarySkuImages = preparedImages.slice(1);

      const skuPayload: Record<string, unknown> = {
        seller_sku: String(skuInput.vtexSkuId),
        external_sku_id: String(
          (skuInput.sku as any).RefId ?? skuInput.sku.refId ?? skuInput.vtexSkuId,
        ),
        price: {
          amount: priceAmount,
          currency: this.currency,
          sale_price: priceAmount,
        },
        inventory,
        identifier_code: identifierCode,
        sku_img: skuImgUri ? { uri: skuImgUri } : undefined,
        supplementary_sku_images:
          supplementarySkuImages.length > 0
            ? supplementarySkuImages.map((image) => ({ uri: image.uri }))
            : undefined,
        sales_attributes: this.buildSalesAttributesForSku(input.product, skuInput),
        sku_unit_count: this.buildSkuUnitCount(skuInput.sku),
      };

      if (options.productId && skuInput.ttsSkuId) {
        // só envia id/sku_id quando estamos atualizando um product_id já existente
        skuPayload.id = String(skuInput.ttsSkuId);
        skuPayload.sku_id = String(skuInput.ttsSkuId);
      }


      skuPayloads.push(this.cleanPayload(skuPayload));
    }

    const description = this.buildDescription(input.product, primarySku);

    const payload: Record<string, unknown> = {
      save_mode: this.saveMode,
      title: this.buildTitle(input.product, primarySku),
      description,
      category_id: categoryId,
      brand_id: brandId,
      brand_name: brandName,
      main_images: Array.from(mainImageUris.values()),
      skus: skuPayloads,
      product_attributes: this.buildProductAttributes(input),
      package_dimensions: this.buildPackageDimensions(primarySku.sku),
      package_weight: this.buildPackageWeight(primarySku.sku),
      is_cod_allowed: false,
      is_pre_owned: false,
      idempotency_key: `vtex-${shopId}-product-${input.product.Id}`,
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
    _shopId: string,
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
      // 1) Baixar a imagem da VTEX como binário
      const imageResponse = await firstValueFrom(
        this.http.get<ArrayBuffer>(normalized, {
          responseType: 'arraybuffer',
        }),
      );

      const buffer = Buffer.from(imageResponse.data);

      // 2) Montar o FormData conforme a doc do TikTok
      const form = new (FormData as any)() as FormData;

      const filename =
        normalized.split('/').pop() || `image-${Date.now()}.jpg`;

      form.append('data', buffer, {
        filename,
        contentType: 'image/jpeg',
      });

      form.append('use_case', 'MAIN_IMAGE');

      // 3) Headers do form (com boundary)
      const formHeaders = form.getHeaders();

      // 4) Assinar a requisição (multipart => body não entra na assinatura)
      const { url, headers } = buildSignedRequest(
        this.openBase,
        '/product/202309/images/upload',
        this.appKey,
        this.appSecret,
        {
          qs: {},
          headers: {
            ...formHeaders,
            'x-tts-access-token': accessToken,
            Authorization: `Bearer ${accessToken}`,
          },
          body: undefined,
        },
      );

      // 5) Enviar o POST com o form como body real
      const response = await firstValueFrom(
        this.http.post(url, form, { headers }),
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
      this.logger.info(
        { imageUrl: normalized, uri },
        'Successfully uploaded image to TikTok',
      );

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

  private buildDescription(
    product: VtexProduct,
    primarySku: TiktokProductSkuInput,
  ): string {
    const description =
      product.Description ??
      product.MetaTagDescription ??
      (primarySku.sku as any)?.Description ??
      this.fallbackDescription;
    return description.toString().trim() || this.fallbackDescription;
  }

  private buildTitle(
    product: VtexProduct,
    primarySku: TiktokProductSkuInput,
  ): string {
    return (
      product.Title ??
      product.Name ??
      primarySku.sku.name ??
      primarySku.sku.Name ??
      `SKU ${primarySku.vtexSkuId}`
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

  private buildSalesAttributesForSku(
    product: VtexProduct,
    skuInput: TiktokProductSkuInput,
  ) {
    const sizeLabel = this.extractSizeLabel(product, skuInput) ?? skuInput.sizeLabel;
    if (!sizeLabel) {
      return [];
    }

    return [
      this.cleanPayload({
        name: 'Size',
        value_name: sizeLabel,
      }),
    ];
  }

  private buildProductAttributes(_input: TiktokProductInput) {
    return [];
  }

  private buildPackageDimensions(sku: VtexSkuSummary) {
    const fallbackLength = this.packageLength ?? 10;
    const fallbackWidth = this.packageWidth ?? 10;
    const fallbackHeight = this.packageHeight ?? 10;

    const length =
      this.extractDimension(sku.PackedLength ?? sku.Length) ?? fallbackLength;
    const width =
      this.extractDimension(sku.PackedWidth ?? sku.Width) ?? fallbackWidth;
    const height =
      this.extractDimension(sku.PackedHeight ?? sku.Height) ?? fallbackHeight;

    return this.cleanPayload({
      length: this.formatNumber(length),
      width: this.formatNumber(width),
      height: this.formatNumber(height),
      unit: this.packageDimensionUnit,
    });
  }

  private buildPackageWeight(sku: VtexSkuSummary) {
    const weight =
      this.extractWeight(
        sku.PackedWeightKg ?? sku.WeightKg ?? sku.RealWeightKg,
      ) ??
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
            typeof item === 'object' && item !== null
              ? this.cleanPayload(item as any)
              : item,
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

  private extractSizeLabel(
    product: VtexProduct,
    skuInput: TiktokProductSkuInput,
  ): string | undefined {
    if (skuInput.sizeLabel) {
      return skuInput.sizeLabel;
    }

    const productName = product.Name?.toString().trim().toLowerCase() ?? '';
    const rawSkuName =
      skuInput.sku.Name ??
      skuInput.sku.name ??
      (skuInput.sku as any)?.NameComplete ??
      '';
    const skuName = rawSkuName ? rawSkuName.toString().trim() : '';

    if (productName && skuName.toLowerCase().startsWith(productName)) {
      const suffix = skuName.slice(productName.length).trim();
      if (suffix) {
        return suffix;
      }
    }

    if (skuName.includes(' ')) {
      const candidate = skuName.split(/\s+/).pop();
      if (candidate) {
        return candidate.trim();
      }
    }

    const refId = (skuInput.sku as any)?.RefId ?? skuInput.sku.refId;
    if (typeof refId === 'string' && refId.includes('_')) {
      const parts = refId.split(/[_-]/).map((part) => part.trim()).filter(Boolean);
      const candidate = parts[parts.length - 1];
      if (candidate && candidate.length <= 6) {
        return candidate;
      }
    }

    return undefined;
  }
}
