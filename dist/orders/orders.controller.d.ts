import { TiktokWebhookDto } from '../common/dto';
import { OrdersService } from './orders.service';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
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
}
