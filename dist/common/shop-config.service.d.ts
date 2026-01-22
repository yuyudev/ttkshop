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
export declare class ShopConfigService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService, logger: PinoLogger);
    getVtexConfig(shopId: string): Promise<VtexShopConfig>;
    getTiktokCatalogConfig(shopId: string): Promise<TiktokCatalogConfig>;
    getTiktokInventoryConfig(shopId: string): Promise<TiktokInventoryConfig>;
    getTiktokOrderConfig(shopId: string): Promise<TiktokOrderConfig>;
    getTiktokDefaultCategoryId(shopId: string): Promise<string | undefined>;
    resolveShopIdByVtexWebhookToken(token: string): Promise<string>;
    private getShopRecord;
    private normalizeOptional;
    private requireValue;
}
