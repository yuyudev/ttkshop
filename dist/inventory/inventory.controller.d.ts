import { InventoryService } from './inventory.service';
import { InventorySyncDto } from '../common/dto';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
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
