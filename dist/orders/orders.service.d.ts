import { PinoLogger } from 'nestjs-pino';
import { OrderWebhookDto } from '../common/dto';
import { IdempotencyService } from '../common/idempotency.service';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokOrderClient } from './tiktok-order.client';
import { VtexOrdersClient } from './vtex-orders.client';
import { LogisticsService } from '../logistics/logistics.service';
export declare class OrdersService {
    private readonly tiktokClient;
    private readonly vtexClient;
    private readonly idempotency;
    private readonly prisma;
    private readonly logisticsService;
    private readonly logger;
    constructor(tiktokClient: TiktokOrderClient, vtexClient: VtexOrdersClient, idempotency: IdempotencyService, prisma: PrismaService, logisticsService: LogisticsService, logger: PinoLogger);
    handleWebhook(payload: OrderWebhookDto): Promise<"skipped" | "processed">;
    getLabel(orderId: string): Promise<{
        orderId: string;
        labelUrl: string;
        document?: undefined;
    } | {
        orderId: string;
        document: any;
        labelUrl?: undefined;
    }>;
    private buildVtexOrderPayload;
    private resolveSimulationPricing;
    private sanitizePriceTags;
    private isVtexPaymentMismatch;
    private logOrderSnapshot;
    private resolveRecipientAddress;
    private isAddressLike;
    private extractPostalCandidates;
    private resolveDocument;
    private extractDocumentCandidates;
    private resolveBuyerProfile;
    private resolveBuyerPhone;
    private splitName;
    private generateCpfFromSeed;
    private digitsFromSeed;
    private computeCpfDigit;
    private isValidCpf;
    private isValidCnpj;
}
