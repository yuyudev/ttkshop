import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogSyncDto } from '../common/dto';
import { VtexCatalogClient } from './vtex-catalog.client';
import { TiktokProductClient } from './tiktok-product.client';
export declare class CatalogService {
    private readonly vtexClient;
    private readonly tiktokClient;
    private readonly prisma;
    private readonly logger;
    private readonly configService;
    private readonly MAX_SKUS_PER_RUN;
    private readonly productSkuCache;
    constructor(vtexClient: VtexCatalogClient, tiktokClient: TiktokProductClient, prisma: PrismaService, logger: PinoLogger, configService: ConfigService);
    syncCatalog(shopId: string, input: CatalogSyncDto): Promise<{
        processed: number;
        synced: number;
        failed: number;
        remaining: number;
        errors: Record<string, string>;
    }>;
    private syncProductBySku;
    syncProduct(shopId: string, productId: string): Promise<{
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
    private fetchImagesSafely;
    private isNotFoundError;
}
