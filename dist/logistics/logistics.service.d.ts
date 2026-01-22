import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokLogisticsClient } from './tiktok-logistics.client';
import { VtexOrdersClient } from '../orders/vtex-orders.client';
type InvoiceMetadata = {
    number?: string;
    value?: number;
    key?: string;
    issuanceDate?: string;
};
export declare class LogisticsService {
    private readonly prisma;
    private readonly logisticsClient;
    private readonly vtexOrdersClient;
    private readonly logger;
    constructor(prisma: PrismaService, logisticsClient: TiktokLogisticsClient, vtexOrdersClient: VtexOrdersClient, logger: PinoLogger);
    generateLabel(shopId: string, orderId: string, orderValue?: number, invoice?: InvoiceMetadata): Promise<{
        orderId: string;
        labelUrl: any;
        document: any;
    }>;
    private updateVtexTracking;
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
export {};
