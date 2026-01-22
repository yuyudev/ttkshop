import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from './config';

export type VtexShopConfig = {
  account: string;
  environment: string;
  domain?: string;
  appKey: string;
  appToken: string;
  affiliateId?: string;
  salesChannel: string;
  warehouseId: string;
  webhookToken?: string;
  marketplaceServicesEndpoint?: string;
  paymentSystemId?: string;
  paymentSystemName?: string;
  paymentGroup?: string;
  paymentMerchant?: string;
  pricingDomain?: string;
};

export type TiktokRequestConfig = {
  appKey: string;
  appSecret: string;
  baseOpen: string;
  baseServ: string;
  baseAuth: string;
  shopCipher: string;
  shopId: string;
};

export type TiktokCatalogConfig = TiktokRequestConfig & {
  defaultCategoryId: string;
  warehouseId: string;
  brandId?: string;
  brandName?: string;
  currency: string;
  saveMode: string;
  descriptionFallback: string;
  packageWeight?: number;
  packageWeightUnit: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageDimensionUnit: string;
  minimumOrderQuantity?: number;
  listingPlatforms?: string[];
};

type CachedValue<T> = { value: T; expiresAt: number };

@Injectable()
export class ShopConfigService {
  private readonly cache = new Map<string, CachedValue<any>>();
  private readonly cacheTtlMs = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShopConfigService.name);
  }

  async getShop(shopId: string) {
    if (!shopId) {
      return null;
    }
    return this.prisma.shop.findUnique({ where: { shopId } });
  }

  async getShopByVtexWebhookToken(token: string) {
    if (!token) {
      return null;
    }
    return this.prisma.shop.findFirst({ where: { vtexWebhookToken: token } });
  }

  async isValidVtexWebhookToken(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }
    const shop = await this.getShopByVtexWebhookToken(token);
    if (shop) {
      return true;
    }
    const fallback = this.configService.get<string>('VTEX_WEBHOOK_TOKEN', { infer: true });
    return Boolean(fallback && token === fallback);
  }

  async resolveVtexConfig(shopId: string): Promise<VtexShopConfig> {
    const cacheKey = `vtex:${shopId}`;
    const cached = this.readCache<VtexShopConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const shop = await this.getShop(shopId);

    const config: VtexShopConfig = {
      account:
        shop?.vtexAccount ??
        this.configService.get<string>('VTEX_ACCOUNT', { infer: true }) ??
        '',
      environment:
        shop?.vtexEnvironment ??
        this.configService.get<string>('VTEX_ENVIRONMENT', { infer: true }) ??
        'vtexcommercestable',
      domain:
        shop?.vtexDomain ?? this.configService.get<string>('VTEX_DOMAIN', { infer: true }),
      appKey:
        shop?.vtexAppKey ??
        this.configService.get<string>('VTEX_APP_KEY', { infer: true }) ??
        '',
      appToken:
        shop?.vtexAppToken ??
        this.configService.get<string>('VTEX_APP_TOKEN', { infer: true }) ??
        '',
      affiliateId:
        shop?.vtexAffiliateId ??
        this.configService.get<string>('VTEX_AFFILIATE_ID', { infer: true }),
      salesChannel:
        shop?.vtexSalesChannel ??
        this.configService.get<string>('VTEX_SALES_CHANNEL', { infer: true }) ??
        '1',
      warehouseId:
        shop?.vtexWarehouseId ??
        this.configService.get<string>('VTEX_WAREHOUSE_ID', { infer: true }) ??
        '1_1',
      webhookToken:
        shop?.vtexWebhookToken ??
        this.configService.get<string>('VTEX_WEBHOOK_TOKEN', { infer: true }),
      marketplaceServicesEndpoint:
        shop?.vtexMarketplaceServicesEndpoint ??
        this.configService.get<string>('VTEX_MARKETPLACE_SERVICES_ENDPOINT', { infer: true }) ??
        this.configService.get<string>('PUBLIC_BASE_URL', { infer: true }),
      paymentSystemId:
        shop?.vtexPaymentSystemId ??
        this.configService.get<string>('VTEX_PAYMENT_SYSTEM_ID', { infer: true }),
      paymentSystemName:
        shop?.vtexPaymentSystemName ??
        this.configService.get<string>('VTEX_PAYMENT_SYSTEM_NAME', { infer: true }),
      paymentGroup:
        shop?.vtexPaymentGroup ??
        this.configService.get<string>('VTEX_PAYMENT_GROUP', { infer: true }),
      paymentMerchant:
        shop?.vtexPaymentMerchant ??
        this.configService.get<string>('VTEX_PAYMENT_MERCHANT', { infer: true }),
      pricingDomain:
        shop?.vtexPricingDomain ??
        this.configService.get<string>('VTEX_PRICING_DOMAIN', { infer: true }),
    };

    const missing = ['account', 'appKey', 'appToken'].filter(
      (key) => !(config as any)[key],
    );
    if (missing.length) {
      throw new Error(
        `Missing VTEX config for shop ${shopId}: ${missing.join(', ')}`,
      );
    }

    this.writeCache(cacheKey, config);
    return config;
  }

  async resolveTiktokRequestConfig(shopId: string): Promise<TiktokRequestConfig> {
    const cacheKey = `tiktok-request:${shopId}`;
    const cached = this.readCache<TiktokRequestConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const shop = await this.getShop(shopId);

    const config: TiktokRequestConfig = {
      appKey: this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true }),
      appSecret: this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true }),
      baseOpen: this.configService.getOrThrow<string>('TIKTOK_BASE_OPEN', { infer: true }),
      baseServ: this.configService.getOrThrow<string>('TIKTOK_BASE_SERV', { infer: true }),
      baseAuth: this.configService.getOrThrow<string>('TIKTOK_BASE_AUTH', { infer: true }),
      shopCipher:
        shop?.tiktokShopCipher ??
        this.configService.get<string>('TIKTOK_SHOP_CIPHER', { infer: true }) ??
        '',
      shopId,
    };

    if (!config.shopCipher) {
      throw new Error(`Missing TikTok shop cipher for shop ${shopId}`);
    }

    this.writeCache(cacheKey, config);
    return config;
  }

  async resolveTiktokDefaultCategoryId(shopId: string): Promise<string | undefined> {
    const shop = await this.getShop(shopId);
    return (
      shop?.tiktokDefaultCategoryId ??
      this.configService.get<string>('TIKTOK_DEFAULT_CATEGORY_ID', { infer: true })
    );
  }

  async resolveTiktokCatalogConfig(shopId: string): Promise<TiktokCatalogConfig> {
    const cacheKey = `tiktok-catalog:${shopId}`;
    const cached = this.readCache<TiktokCatalogConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const shop = await this.getShop(shopId);
    const baseConfig = await this.resolveTiktokRequestConfig(shopId);

    const listingPlatforms =
      shop?.tiktokListingPlatforms ??
      this.configService.get<string[]>('TIKTOK_LISTING_PLATFORMS', { infer: true });

    const config: TiktokCatalogConfig = {
      ...baseConfig,
      defaultCategoryId:
        shop?.tiktokDefaultCategoryId ??
        this.configService.get<string>('TIKTOK_DEFAULT_CATEGORY_ID', { infer: true }) ??
        '',
      warehouseId:
        shop?.tiktokWarehouseId ??
        this.configService.get<string>('TIKTOK_WAREHOUSE_ID', { infer: true }) ??
        '',
      brandId:
        shop?.tiktokBrandId ??
        this.configService.get<string>('TIKTOK_BRAND_ID', { infer: true }),
      brandName:
        shop?.tiktokBrandName ??
        this.configService.get<string>('TIKTOK_BRAND_NAME', { infer: true }),
      currency:
        shop?.tiktokCurrency ??
        this.configService.get<string>('TIKTOK_CURRENCY', { infer: true }) ??
        'BRL',
      saveMode:
        shop?.tiktokSaveMode ??
        this.configService.get<string>('TIKTOK_SAVE_MODE', { infer: true }) ??
        'LISTING',
      descriptionFallback:
        this.configService.get<string>('TIKTOK_DESCRIPTION_FALLBACK', { infer: true }) ??
        'No description provided.',
      packageWeight:
        shop?.tiktokPackageWeight ??
        this.configService.get<number>('TIKTOK_PACKAGE_WEIGHT', { infer: true }),
      packageWeightUnit:
        shop?.tiktokPackageWeightUnit ??
        this.configService.get<string>('TIKTOK_PACKAGE_WEIGHT_UNIT', { infer: true }) ??
        'KILOGRAM',
      packageLength:
        shop?.tiktokPackageLength ??
        this.configService.get<number>('TIKTOK_PACKAGE_LENGTH', { infer: true }),
      packageWidth:
        shop?.tiktokPackageWidth ??
        this.configService.get<number>('TIKTOK_PACKAGE_WIDTH', { infer: true }),
      packageHeight:
        shop?.tiktokPackageHeight ??
        this.configService.get<number>('TIKTOK_PACKAGE_HEIGHT', { infer: true }),
      packageDimensionUnit:
        shop?.tiktokPackageDimensionUnit ??
        this.configService.get<string>('TIKTOK_PACKAGE_DIMENSION_UNIT', { infer: true }) ??
        'CENTIMETER',
      minimumOrderQuantity:
        shop?.tiktokMinimumOrderQuantity ??
        this.configService.get<number>('TIKTOK_MINIMUM_ORDER_QUANTITY', { infer: true }),
      listingPlatforms: Array.isArray(listingPlatforms) ? listingPlatforms : undefined,
    };

    const missing = ['defaultCategoryId', 'warehouseId'].filter(
      (key) => !(config as any)[key],
    );
    if (missing.length) {
      throw new Error(
        `Missing TikTok catalog config for shop ${shopId}: ${missing.join(', ')}`,
      );
    }

    this.writeCache(cacheKey, config);
    return config;
  }

  private readCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value as T;
  }

  private writeCache<T>(key: string, value: T) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }
}
