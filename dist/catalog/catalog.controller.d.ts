import { CatalogService } from './catalog.service';
import { CatalogSyncDto } from '../common/dto';
export declare class CatalogController {
    private readonly catalogService;
    constructor(catalogService: CatalogService);
    syncCatalog(shopId: string, payload: CatalogSyncDto): Promise<{
        processed: number;
        synced: number;
        failed: number;
        errors: Record<string, string>;
    }>;
}
