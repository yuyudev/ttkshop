import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TiktokAuth } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';

export interface VtexShopConfig {
  account: string;
  environment: string;
  appKey: string;
  appToken: string;
  warehouseId: string;
  salesChannel: string;
  affiliateId?: string;
  webhookToken?: string;
  domain?: string;
  pricingDomain?: string;
  marketplaceServicesEndpoint?: string;
  paymentSystemId?: string;
  paymentSystemName?: string;
  paymentGroup?: string;
  paymentMerchant?: string;
}

export interface TiktokCatalogConfig {
  shopCipher: string;
  warehouseId: string;
  defaultCategoryId: string;
  brandId?: string;
  brandName?: string;
}

export interface TiktokInventoryConfig {
  shopCipher: string;
  warehouseId: string;
}

export interface TiktokOrderConfig {
  shopCipher: string;
}

@Injectable()
export class ShopConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShopConfigService.name);
  }

  async getVtexConfig(shopId: string): Promise<VtexShopConfig> {
    const record = await this.getShopRecord(shopId);

    return {
      account: this.requireValue(record, 'vtexAccount', 'VTEX_ACCOUNT', record.shopId),
      environment: this.requireValue(
        record,
        'vtexEnvironment',
        'VTEX_ENVIRONMENT',
        record.shopId,
      ),
      appKey: this.requireValue(record, 'vtexAppKey', 'VTEX_APP_KEY', record.shopId),
      appToken: this.requireValue(record, 'vtexAppToken', 'VTEX_APP_TOKEN', record.shopId),
      warehouseId:
        this.normalizeOptional(record.vtexWarehouseId) ?? '1_1',
      salesChannel:
        this.normalizeOptional(record.vtexSalesChannel) ?? '1',
      affiliateId: this.normalizeOptional(record.vtexAffiliateId),
      webhookToken: this.normalizeOptional(record.vtexWebhookToken),
      domain: this.normalizeOptional(record.vtexDomain),
      pricingDomain: this.normalizeOptional(record.vtexPricingDomain),
      marketplaceServicesEndpoint: this.normalizeOptional(
        record.vtexMarketplaceServicesEndpoint,
      ),
      paymentSystemId: this.normalizeOptional(record.vtexPaymentSystemId),
      paymentSystemName: this.normalizeOptional(record.vtexPaymentSystemName),
      paymentGroup: this.normalizeOptional(record.vtexPaymentGroup),
      paymentMerchant: this.normalizeOptional(record.vtexPaymentMerchant),
    };
  }

  async getTiktokCatalogConfig(shopId: string): Promise<TiktokCatalogConfig> {
    const record = await this.getShopRecord(shopId);

    return {
      shopCipher: this.requireValue(
        record,
        'tiktokShopCipher',
        'TIKTOK_SHOP_CIPHER',
        record.shopId,
      ),
      warehouseId: this.requireValue(
        record,
        'tiktokWarehouseId',
        'TIKTOK_WAREHOUSE_ID',
        record.shopId,
      ),
      defaultCategoryId: this.requireValue(
        record,
        'tiktokDefaultCategoryId',
        'TIKTOK_DEFAULT_CATEGORY_ID',
        record.shopId,
      ),
      brandId: this.normalizeOptional(record.tiktokBrandId),
      brandName: this.normalizeOptional(record.tiktokBrandName),
    };
  }

  async getTiktokInventoryConfig(shopId: string): Promise<TiktokInventoryConfig> {
    const record = await this.getShopRecord(shopId);

    return {
      shopCipher: this.requireValue(
        record,
        'tiktokShopCipher',
        'TIKTOK_SHOP_CIPHER',
        record.shopId,
      ),
      warehouseId: this.requireValue(
        record,
        'tiktokWarehouseId',
        'TIKTOK_WAREHOUSE_ID',
        record.shopId,
      ),
    };
  }

  async getTiktokOrderConfig(shopId: string): Promise<TiktokOrderConfig> {
    const record = await this.getShopRecord(shopId);

    return {
      shopCipher: this.requireValue(
        record,
        'tiktokShopCipher',
        'TIKTOK_SHOP_CIPHER',
        record.shopId,
      ),
    };
  }

  async getTiktokDefaultCategoryId(shopId: string): Promise<string | undefined> {
    const record = await this.getShopRecord(shopId);
    return this.normalizeOptional(record.tiktokDefaultCategoryId);
  }

  async resolveShopIdByVtexWebhookToken(token: string): Promise<string> {
    const normalized = this.normalizeOptional(token);
    if (!normalized) {
      throw new BadRequestException('Missing VTEX webhook token');
    }

    const record = await this.prisma.tiktokAuth.findFirst({
      where: { vtexWebhookToken: normalized },
      select: { shopId: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid VTEX webhook token');
    }

    return record.shopId;
  }

  private async getShopRecord(shopId: string): Promise<TiktokAuth> {
    const normalized = this.normalizeOptional(shopId);
    if (!normalized) {
      throw new BadRequestException('Missing shop id');
    }

    const record = await this.prisma.tiktokAuth.findUnique({
      where: { shopId: normalized },
    });

    if (!record) {
      throw new NotFoundException(`Shop ${normalized} not found`);
    }

    return record;
  }

  private normalizeOptional(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private requireValue(
    record: TiktokAuth,
    key: keyof TiktokAuth,
    label: string,
    shopId: string,
  ): string {
    const value = this.normalizeOptional(record[key] as unknown);
    if (!value) {
      throw new BadRequestException(`Missing ${label} for shop ${shopId}`);
    }
    return value;
  }
}
