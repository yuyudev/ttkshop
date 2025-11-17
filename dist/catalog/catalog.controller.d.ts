import { PinoLogger } from 'nestjs-pino';
import { CatalogService } from './catalog.service';
import { CatalogSyncDto } from '../common/dto';
export declare class CatalogController {
    private readonly catalogService;
    private readonly logger;
    constructor(catalogService: CatalogService, logger: PinoLogger);
    syncCatalog(shopId: string, payload: CatalogSyncDto): Promise<{
        processed: number;
        synced: number;
        failed: number;
        remaining: number;
        errors: Record<string, string>;
    }>;
    syncCatalogByProduct(productId: string, shopId: string): Promise<{
        processedSkus: number;
        syncedSkus: number;
        errors: Record<string, string>;
        budgetExceeded?: boolean;
    }>;
}
