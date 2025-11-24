import { PinoLogger } from 'nestjs-pino';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from './vtex-catalog.client';
export declare class CatalogScheduler {
    private readonly catalogService;
    private readonly prisma;
    private readonly vtexClient;
    private readonly logger;
    constructor(catalogService: CatalogService, prisma: PrismaService, vtexClient: VtexCatalogClient, logger: PinoLogger);
    nightlySync(): Promise<void>;
    syncAllProducts(shopId: string, startProductId?: string): Promise<void>;
    private compareProductIds;
}
