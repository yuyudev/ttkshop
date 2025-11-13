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
let LogisticsService = LogisticsService_1 = class LogisticsService {
    constructor(prisma, logisticsClient, logger) {
        this.prisma = prisma;
        this.logisticsClient = logisticsClient;
        this.logger = logger;
        this.logger.setContext(LogisticsService_1.name);
    }
    async generateLabel(shopId, orderId) {
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
        return {
            orderId,
            labelUrl,
            document: response.data?.data ?? response.data,
        };
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
        nestjs_pino_1.PinoLogger])
], LogisticsService);
//# sourceMappingURL=logistics.service.js.map