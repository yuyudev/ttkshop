import { PinoLogger } from 'nestjs-pino';
import { InventorySyncDto } from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from '../catalog/vtex-catalog.client';
import { TiktokProductClient } from '../catalog/tiktok-product.client';
export declare class InventoryService {
    private readonly prisma;
    private readonly vtexClient;
    private readonly tiktokClient;
    private readonly logger;
    constructor(prisma: PrismaService, vtexClient: VtexCatalogClient, tiktokClient: TiktokProductClient, logger: PinoLogger);
    syncInventory(shopId: string, payload: InventorySyncDto): Promise<{
        shopId: string;
        warehouseId: string;
        count: number;
        results: ({
            skuId: string;
            inventory: number;
            status: string;
            error?: undefined;
        } | {
            skuId: string;
            status: string;
            error: string;
            inventory?: undefined;
        })[];
    }>;
}
