import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { InventorySyncDto } from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from '../catalog/vtex-catalog.client';
import { TiktokProductClient } from '../catalog/tiktok-product.client';
import { CatalogService } from '../catalog/catalog.service';
import { AppConfig } from '../common/config';
export declare class InventoryService {
    private readonly prisma;
    private readonly vtexClient;
    private readonly tiktokClient;
    private readonly catalogService;
    private readonly configService;
    private readonly logger;
    constructor(prisma: PrismaService, vtexClient: VtexCatalogClient, tiktokClient: TiktokProductClient, catalogService: CatalogService, configService: ConfigService<AppConfig>, logger: PinoLogger);
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
    handleVtexWebhook(payload: any): Promise<{
        status: string;
        reason: string;
        results?: undefined;
    } | {
        status: string;
        results: {
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
        }[];
        reason?: undefined;
    }>;
    scheduleVtexInventory(payload: any): void;
    scheduleVtexNotification(payload: any): void;
    handleVtexNotification(payload: any): Promise<{
        status: string;
        reason: string;
        results?: undefined;
    } | {
        status: string;
        results: Record<string, unknown>[];
        reason?: undefined;
    }>;
    private normalizeAffiliateNotification;
    private extractSkuId;
    private extractProductId;
    private toBoolean;
}
