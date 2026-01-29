import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
import { VtexProduct, VtexSkuImage, VtexSkuSummary } from './vtex-catalog.client';
import { ShopConfigService } from '../common/shop-config.service';
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
    sellerSkuOverride?: string;
}
export interface TiktokProductResponse {
    productId: string | null;
    skuIds: Record<string, string>;
    raw: any;
}
interface ProductPayloadOptions {
    productId?: string;
    idempotencyKeySuffix?: string;
    externalSkuIdSuffix?: string;
    categoryId?: string;
}
export declare class TiktokProductClient {
    private readonly http;
    private readonly configService;
    private readonly tiktokShopService;
    private readonly shopConfigService;
    private readonly logger;
    private readonly openBase;
    private readonly appKey;
    private readonly appSecret;
    private readonly currency;
    private readonly saveMode;
    private readonly fallbackDescription;
    private readonly packageWeight?;
    private readonly packageWeightUnit;
    private readonly packageLength?;
    private readonly packageWidth?;
    private readonly packageHeight?;
    private readonly packageDimensionUnit;
    private readonly minimumOrderQuantity?;
    private readonly listingPlatforms?;
    private readonly imageUriCache;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, tiktokShopService: TiktokShopService, shopConfigService: ShopConfigService, logger: PinoLogger);
    createProduct(shopId: string, input: TiktokProductInput, options?: ProductPayloadOptions): Promise<TiktokProductResponse>;
    updateProduct(shopId: string, productId: string, input: TiktokProductInput, options?: ProductPayloadOptions): Promise<TiktokProductResponse>;
    updateStock(shopId: string, _warehouseId: string, ttsSkuId: string, availableQuantity: number, ttsProductId: string): Promise<void>;
    private buildSignedOpenApiRequest;
    private buildAccessHeaders;
    private normalizeBaseUrl;
    private parseProductResponse;
    private buildTikTokError;
    private isExpiredError;
    private withTokenRetry;
    private uploadImageWithToken;
    private buildSellerSku;
    private buildExternalSkuId;
    private buildIdempotencyKey;
    private buildProductPayload;
    private prepareImages;
    private ensureImageUri;
    private buildDescription;
    private buildTitle;
    private buildIdentifierCode;
    private buildSkuUnitCount;
    private buildSalesAttributesForSku;
    private buildProductAttributes;
    private buildPackageDimensions;
    private buildPackageWeight;
    private extractDimension;
    private extractWeight;
    private formatPrice;
    private formatNumber;
    private cleanPayload;
    private extractSizeLabel;
    private extractSizeToken;
    private isSizeToken;
}
export {};
