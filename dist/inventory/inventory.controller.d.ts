import { InventoryService } from './inventory.service';
import { InventorySyncDto } from '../common/dto';
import { ShopConfigService } from '../common/shop-config.service';
export declare class InventoryController {
    private readonly inventoryService;
    private readonly shopConfigService;
    constructor(inventoryService: InventoryService, shopConfigService: ShopConfigService);
    handleVtexWebhook(payload: any): Promise<{
        status: string;
    }>;
    handleVtexNotification(token: string, payload: any): Promise<{
        status: string;
    }>;
    manualSync(shopId: string, payload: InventorySyncDto): Promise<{
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
