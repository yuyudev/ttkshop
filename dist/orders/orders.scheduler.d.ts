import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfig } from '../common/config';
import { OrdersService } from './orders.service';
export declare class OrdersInvoiceScheduler {
    private readonly ordersService;
    private readonly configService;
    private readonly logger;
    constructor(ordersService: OrdersService, configService: ConfigService<AppConfig>, logger: PinoLogger);
    pollPendingInvoices(): Promise<void>;
}
