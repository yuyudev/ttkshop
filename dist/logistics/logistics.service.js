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
    async generateLabel(shopId, orderId, orderValue) {
        const mapping = await this.prisma.orderMap.findUnique({
            where: { ttsOrderId: orderId },
        });
        if (!mapping) {
            throw new common_1.NotFoundException(`Order mapping not found for TikTok order ${orderId}`);
        }
        const response = await this.logisticsClient.getOrCreateShippingDocument(shopId, orderId);
        const labelUrl = response.data?.data?.label_url ??
            response.data?.data?.document_url ??
            response.data?.label_url ??
            null;
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
                    await this.updateVtexTracking(mapping.vtexOrderId, trackingNumber, provider, orderValue ?? 0);
                    this.logger.info({ orderId, vtexOrderId: mapping.vtexOrderId }, 'Updated VTEX tracking');
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
    async updateVtexTracking(vtexOrderId, trackingNumber, courier, value) {
        const invoiceData = {
            type: 'Output',
            invoiceNumber: `TTS-${trackingNumber.slice(-5)}`,
            issuanceDate: new Date().toISOString().split('T')[0],
            invoiceValue: value,
            trackingNumber,
            courier,
            items: [],
        };
        return this.vtexOrdersClient.updateTracking(vtexOrderId, invoiceData);
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