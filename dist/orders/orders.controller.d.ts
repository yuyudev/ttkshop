import { ShopConfigService } from '../common/shop-config.service';
import { TiktokWebhookDto } from '../common/dto';
import { OrdersService } from './orders.service';
export declare class OrdersController {
    private readonly ordersService;
    private readonly shopConfigService;
    constructor(ordersService: OrdersService, shopConfigService: ShopConfigService);
    handleWebhook(payload: TiktokWebhookDto): Promise<{
        status: string;
    }>;
    getLabel(orderId: string): Promise<{
        orderId: string;
        labelUrl: string;
        document?: undefined;
    } | {
        orderId: string;
        document: any;
        labelUrl?: undefined;
    }>;
    handleVtexMarketplace(token: string, payload: any): Promise<{
        status: string;
    }>;
}
