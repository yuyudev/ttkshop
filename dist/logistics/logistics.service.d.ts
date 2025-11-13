import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokLogisticsClient } from './tiktok-logistics.client';
export declare class LogisticsService {
    private readonly prisma;
    private readonly logisticsClient;
    private readonly logger;
    constructor(prisma: PrismaService, logisticsClient: TiktokLogisticsClient, logger: PinoLogger);
    generateLabel(shopId: string, orderId: string): Promise<{
        orderId: string;
        labelUrl: any;
        document: any;
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
