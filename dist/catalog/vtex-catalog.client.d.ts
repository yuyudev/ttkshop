import { HttpService } from '@nestjs/axios';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
export interface VtexSkuSummary {
    id: string;
    productId: string;
    name: string;
    refId?: string;
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
    private readonly logger;
    private readonly account;
    private readonly environment;
    private readonly domainOverride?;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, logger: PinoLogger);
    listSkus(updatedFrom?: string): Promise<VtexSkuSummary[]>;
    private fetchSkuRange;
    getSkuById(skuId: string): Promise<VtexSkuSummary>;
    getProductWithSkus(productId: string): Promise<any>;
    getProductById(productId: string): Promise<VtexProduct>;
    getPrice(skuId: string): Promise<number>;
    setPrice(skuId: string, price: number): Promise<void>;
    updateStock(skuId: string, warehouseId: string, quantity: number): Promise<{
        quantity: number;
    }>;
    getSkuImages(skuId: string): Promise<VtexSkuImage[]>;
    private baseUrl;
    private defaultHeaders;
}
