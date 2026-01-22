"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LogisticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogisticsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
const tiktok_logistics_client_1 = require("./tiktok-logistics.client");
const vtex_orders_client_1 = require("../orders/vtex-orders.client");
let LogisticsService = LogisticsService_1 = class LogisticsService {
    constructor(prisma, logisticsClient, vtexOrdersClient, logger) {
        this.prisma = prisma;
        this.logisticsClient = logisticsClient;
        this.vtexOrdersClient = vtexOrdersClient;
        this.logger = logger;
        this.logger.setContext(LogisticsService_1.name);
    }
    async generateLabel(shopId, orderId, orderValue, invoice) {
        this.logger.info({ shopId, orderId, orderValue }, 'Generating shipping label');
        const mapping = await this.prisma.orderMap.findUnique({
            where: { ttsOrderId: orderId },
        });
        if (!mapping) {
            this.logger.error({ orderId }, 'Order mapping not found for label generation');
            throw new common_1.NotFoundException(`Order mapping not found for TikTok order ${orderId}`);
        }
        const response = await this.logisticsClient.getOrCreateShippingDocument(shopId, orderId);
        const labelUrl = response.data?.data?.label_url ??
            response.data?.data?.document_url ??
            response.data?.label_url ??
            null;
        this.logger.info({ orderId, labelUrl }, 'Shipping label generated');
        await this.prisma.orderMap.update({
            where: { ttsOrderId: orderId },
            data: {
                labelUrl,
                lastError: null,
                shopId,
            },
        });
        if (mapping.vtexOrderId && labelUrl) {
            try {
                const docDetails = await this.logisticsClient.getShippingDocument(shopId, orderId);
                const trackingNumber = docDetails.data?.data?.tracking_number ?? docDetails.data?.tracking_number;
                const provider = docDetails.data?.data?.shipping_provider ??
                    docDetails.data?.shipping_provider ??
                    'TikTok Shipping';
                if (trackingNumber) {
                    this.logger.info({ orderId, vtexOrderId: mapping.vtexOrderId, trackingNumber, provider }, 'Updating VTEX with tracking info');
                    await this.updateVtexTracking(mapping.shopId, mapping.vtexOrderId, trackingNumber, provider, orderValue ?? 0, invoice);
                    this.logger.info({ orderId, vtexOrderId: mapping.vtexOrderId }, 'Updated VTEX tracking');
                }
                else {
                    this.logger.warn({ orderId }, 'No tracking number available from TikTok');
                }
            }
            catch (err) {
                this.logger.error({ err, orderId }, 'Failed to update VTEX tracking');
            }
        }
        return {
            orderId,
            labelUrl,
            document: response.data?.data ?? response.data,
        };
    }
    async updateVtexTracking(shopId, vtexOrderId, trackingNumber, courier, value, invoice) {
        const invoiceNumber = invoice?.number ?? `TTS-${trackingNumber.slice(-5)}`;
        const issuanceDate = invoice?.issuanceDate ?? new Date().toISOString().split('T')[0];
        const invoiceValue = Number.isFinite(Number(invoice?.value)) ? Number(invoice?.value) : value;
        const invoiceData = {
            type: 'Output',
            invoiceNumber,
            issuanceDate,
            invoiceValue,
            trackingNumber,
            courier,
            items: [],
        };
        if (invoice?.key) {
            invoiceData.invoiceKey = invoice.key;
        }
        return this.vtexOrdersClient.updateTracking(shopId, vtexOrderId, invoiceData);
    }
    async getLabel(orderId) {
        const mapping = await this.prisma.orderMap.findUnique({
            where: { ttsOrderId: orderId },
        });
        if (!mapping) {
            throw new common_1.NotFoundException(`Order ${orderId} not found`);
        }
        if (mapping.labelUrl) {
            return { orderId, labelUrl: mapping.labelUrl };
        }
        this.logger.warn({ orderId }, 'Label not cached, fetching directly from TikTok');
        const response = await this.logisticsClient.getShippingDocument(mapping.shopId, orderId);
        return {
            orderId,
            document: response.data?.data ?? response.data,
        };
    }
};
exports.LogisticsService = LogisticsService;
exports.LogisticsService = LogisticsService = LogisticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        tiktok_logistics_client_1.TiktokLogisticsClient,
        vtex_orders_client_1.VtexOrdersClient,
        nestjs_pino_1.PinoLogger])
], LogisticsService);
//# sourceMappingURL=logistics.service.js.map