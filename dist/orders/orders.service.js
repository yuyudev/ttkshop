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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const idempotency_service_1 = require("../common/idempotency.service");
const prisma_service_1 = require("../prisma/prisma.service");
const tiktok_order_client_1 = require("./tiktok-order.client");
const vtex_orders_client_1 = require("./vtex-orders.client");
const logistics_service_1 = require("../logistics/logistics.service");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(tiktokClient, vtexClient, idempotency, prisma, logisticsService, logger) {
        this.tiktokClient = tiktokClient;
        this.vtexClient = vtexClient;
        this.idempotency = idempotency;
        this.prisma = prisma;
        this.logisticsService = logisticsService;
        this.logger = logger;
        this.logger.setContext(OrdersService_1.name);
    }
    async handleWebhook(payload) {
        const shopId = payload.shop_id;
        const orderId = payload.order_id;
        const idempotencyKey = `tiktok-order:${payload.event_type}:${orderId}`;
        return this.idempotency.register(idempotencyKey, payload, async () => {
            const orderDetailsResponse = await this.tiktokClient.getOrder(shopId, orderId);
            const orderDetails = orderDetailsResponse.data?.data ?? orderDetailsResponse.data;
            const vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId);
            const vtexResponse = await this.vtexClient.createOrder(vtexPayload);
            const vtexOrderId = vtexResponse.data?.orderId ?? vtexResponse.data?.id ?? null;
            await this.prisma.orderMap.upsert({
                where: { ttsOrderId: orderId },
                update: {
                    vtexOrderId,
                    status: 'imported',
                    lastError: null,
                    shopId,
                },
                create: {
                    ttsOrderId: orderId,
                    shopId,
                    vtexOrderId,
                    status: 'imported',
                },
            });
            await this.logisticsService.generateLabel(shopId, orderId, orderDetails?.payment?.total ?? 0);
        });
    }
    async getLabel(orderId) {
        return this.logisticsService.getLabel(orderId);
    }
    async buildVtexOrderPayload(order, shopId) {
        const items = Array.isArray(order?.items) ? order.items : [];
        const mappedItems = [];
        for (const item of items) {
            const mapping = await this.prisma.productMap.findFirst({
                where: {
                    shopId,
                    OR: [{ ttsSkuId: item.sku_id }, { ttsProductId: item.product_id }],
                },
            });
            if (!mapping) {
                this.logger.warn({ skuId: item.sku_id }, 'Unable to find product mapping for TikTok item; skipping');
                continue;
            }
            mappedItems.push({
                id: mapping.vtexSkuId,
                quantity: item.quantity ?? 1,
                seller: '1',
                price: item.price ?? 0,
            });
        }
        return {
            marketplaceOrderId: order?.order_id,
            clientProfileData: {
                firstName: order?.buyer?.first_name ?? 'TikTok',
                lastName: order?.buyer?.last_name ?? 'Buyer',
                email: order?.buyer?.email ?? 'no-reply@tiktokshop.com',
            },
            shippingData: {
                address: order?.shipping_address ?? {},
            },
            items: mappedItems,
            marketplaceServicesEndpoint: 'TikTokShop',
            paymentData: {
                payments: [
                    {
                        paymentSystem: '2',
                        value: order?.payment?.total ?? 0,
                    },
                ],
            },
        };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tiktok_order_client_1.TiktokOrderClient,
        vtex_orders_client_1.VtexOrdersClient,
        idempotency_service_1.IdempotencyService,
        prisma_service_1.PrismaService,
        logistics_service_1.LogisticsService,
        nestjs_pino_1.PinoLogger])
], OrdersService);
//# sourceMappingURL=orders.service.js.map