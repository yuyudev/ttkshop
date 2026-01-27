import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogSyncDto } from '../common/dto';
import { VtexCatalogClient } from './vtex-catalog.client';
import { TiktokProductClient } from './tiktok-product.client';
import { CategoryMappingService } from './category-mapping.service';
import { ShopConfigService } from '../common/shop-config.service';
export declare class CatalogService {
    private readonly vtexClient;
    private readonly tiktokClient;
    private readonly prisma;
    private readonly logger;
    private readonly categoryMappingService;
    private readonly shopConfigService;
    private readonly MAX_SKUS_PER_RUN;
    private readonly productSkuCache;
    constructor(vtexClient: VtexCatalogClient, tiktokClient: TiktokProductClient, prisma: PrismaService, logger: PinoLogger, categoryMappingService: CategoryMappingService, shopConfigService: ShopConfigService);
    syncCatalog(shopId: string, input: CatalogSyncDto): Promise<{
        processed: number;
        synced: number;
        failed: number;
        remaining: number;
        errors: Record<string, string>;
    }>;
    private syncProductBySku;
    syncProduct(shopId: string, productId: string, options?: {
        allowZeroStock?: boolean;
    }): Promise<{
        processedSkus: number;
        syncedSkus: number;
        errors: Record<string, string>;
        budgetExceeded?: boolean;
    }>;
    syncProductBySkuId(shopId: string, vtexSkuId: string, options?: {
        allowZeroStock?: boolean;
    }): Promise<{
        processedSkus: number;
        syncedSkus: number;
        errors: Record<string, string>;
        budgetExceeded?: boolean;
    }>;
    private extractProductId;
    private getSkuIdsForProduct;
    private normalizeProductSkuIds;
    private extractSkuIdsFromSearchPayload;
    private deriveSizeLabel;
    private extractSizeToken;
    private isSizeToken;
    private fetchImagesSafely;
    private syncInventoryForSku;
    private isNotFoundError;
    private isTikTokProductStatusInvalid;
    private isTikTokExternalIdDuplicate;
    private generateRecreateSuffix;
    private applySellerSkuOverride;
}
