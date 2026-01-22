import { HttpService } from '@nestjs/axios';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
import { ShopConfigService } from '../common/shop-config.service';
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
export declare class VtexCatalogClient {
    private readonly http;
    private readonly configService;
    private readonly shopConfigService;
    private readonly logger;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, shopConfigService: ShopConfigService, logger: PinoLogger);
    listSkus(shopId: string, updatedFrom?: string): Promise<VtexSkuSummary[]>;
    private fetchSkuPage;
    getSkuInventory(shopId: string, skuId: string, warehouseId: string): Promise<number>;
    getSkuById(shopId: string, skuId: string): Promise<VtexSkuSummary>;
    getProductWithSkus(shopId: string, productId: string): Promise<any>;
    searchProductWithItems(shopId: string, productId: string): Promise<any>;
    getProductById(shopId: string, productId: string): Promise<VtexProduct>;
    getPrice(shopId: string, skuId: string): Promise<number>;
    setPrice(shopId: string, skuId: string, price: number): Promise<void>;
    updateStock(shopId: string, skuId: string, warehouseId: string, quantity: number): Promise<{
        quantity: number;
    }>;
    getSkuImages(shopId: string, skuId: string): Promise<VtexSkuImage[]>;
    private buildVtexImageUrl;
    private normalizeFileLocation;
    private buildBaseUrl;
    private buildPricingBaseUrl;
    private buildDefaultHeaders;
}
