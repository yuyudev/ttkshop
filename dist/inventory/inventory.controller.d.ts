import { InventoryService } from './inventory.service';
import { InventorySyncDto } from '../common/dto';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
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
