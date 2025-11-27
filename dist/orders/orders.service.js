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
        const orderId = payload.data.order_id;
        const eventType = payload.type;
        const idempotencyKey = `tiktok-order:${eventType}:${orderId}`;
        this.logger.info({ shopId, orderId, eventType }, 'Processing TikTok order webhook');
        return this.idempotency.register(idempotencyKey, payload, async () => {
            try {
                const orderDetailsResponse = await this.tiktokClient.getOrder(shopId, orderId);
                const orderDetails = orderDetailsResponse.data?.data?.orders?.[0] ?? orderDetailsResponse.data?.data ?? orderDetailsResponse.data;
                this.logger.info({ orderId, status: orderDetails?.status }, 'Fetched TikTok order details');
                const skipStatuses = ['CANCELLED', 'CANCEL_REQUESTED'];
                if (skipStatuses.includes(orderDetails?.status)) {
                    this.logger.info({ orderId, status: orderDetails?.status }, 'Skipping order - not ready for fulfillment');
                    return;
                }
                const vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId);
                let vtexResponse;
                try {
                    vtexResponse = await this.vtexClient.createOrder(vtexPayload);
                    const responseData = vtexResponse.data;
                    const firstOrder = Array.isArray(responseData) ? responseData[0] : responseData;
                    const vtexOrderId = firstOrder?.orderId ?? firstOrder?.id ?? null;
                    this.logger.info({ orderId, vtexOrderId }, 'Created VTEX order successfully');
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
                    this.logger.info({ orderId, orderValue: orderDetails?.payment?.total }, 'Initiating label generation');
                    await this.logisticsService.generateLabel(shopId, orderId, orderDetails?.payment?.total ?? 0);
                    this.logger.info({ orderId, vtexOrderId }, 'TikTok order processed successfully');
                }
                catch (vtexError) {
                    this.logger.error({
                        err: vtexError,
                        orderId,
                        vtexPayload,
                        errorMessage: vtexError?.message,
                        errorResponse: vtexError?.response?.data,
                        statusCode: vtexError?.response?.status,
                    }, 'Failed to create VTEX order');
                    await this.prisma.orderMap.upsert({
                        where: { ttsOrderId: orderId },
                        update: {
                            status: 'error',
                            lastError: `VTEX API Error: ${vtexError?.message || 'Unknown error'}`,
                            shopId,
                        },
                        create: {
                            ttsOrderId: orderId,
                            shopId,
                            status: 'error',
                            lastError: `VTEX API Error: ${vtexError?.message || 'Unknown error'}`,
                        },
                    });
                    throw vtexError;
                }
            }
            catch (error) {
                this.logger.error({
                    err: error,
                    orderId,
                    shopId,
                    errorResponse: error?.response?.data,
                    statusCode: error?.response?.status
                }, 'Failed to process TikTok order webhook');
                throw error;
            }
        });
    }
    async getLabel(orderId) {
        return this.logisticsService.getLabel(orderId);
    }
    async buildVtexOrderPayload(order, shopId) {
        const items = Array.isArray(order?.line_items) ? order.line_items : (Array.isArray(order?.items) ? order.items : []);
        const mappedItems = [];
        for (const item of items) {
            const mapping = await this.prisma.productMap.findFirst({
                where: {
                    shopId,
                    OR: [{ ttsSkuId: item.sku_id }, { ttsProductId: item.product_id }],
                },
            });
            if (!mapping) {
                if (item.seller_sku) {
                    this.logger.info({ skuId: item.sku_id, sellerSku: item.seller_sku }, 'Mapping not found, trying to use seller_sku as VTEX ID');
                    try {
                        await this.prisma.productMap.upsert({
                            where: { vtexSkuId: item.seller_sku },
                            update: {
                                ttsSkuId: item.sku_id,
                                ttsProductId: item.product_id,
                                shopId,
                            },
                            create: {
                                shopId,
                                vtexSkuId: item.seller_sku,
                                ttsSkuId: item.sku_id,
                                ttsProductId: item.product_id,
                                status: 'auto_mapped',
                            }
                        });
                    }
                    catch (e) {
                        this.logger.warn({ err: e }, 'Failed to auto-create product mapping');
                    }
                    mappedItems.push({
                        id: item.seller_sku,
                        quantity: item.quantity ?? 1,
                        seller: '1',
                        price: item.sale_price ?? item.original_price ?? item.price ?? 0,
                    });
                    continue;
                }
                this.logger.warn({ skuId: item.sku_id, productId: item.product_id }, 'Unable to find product mapping for TikTok item; skipping');
                continue;
            }
            mappedItems.push({
                id: mapping.vtexSkuId,
                quantity: item.quantity ?? 1,
                seller: '1',
                price: item.sale_price ?? item.original_price ?? item.price ?? 0,
            });
        }
        const address = {
            addressType: 'residential',
            receiverName: order?.recipient_address?.name || 'TikTok Buyer',
            postalCode: order?.recipient_address?.postal_code || '01001000',
            city: order?.recipient_address?.district_info?.find((d) => d.address_level === 'L2')?.address_name || 'São Paulo',
            state: order?.recipient_address?.district_info?.find((d) => d.address_level === 'L1')?.address_name || 'SP',
            country: order?.recipient_address?.region_code || 'BRA',
            street: order?.recipient_address?.address_line2 || order?.recipient_address?.address_line1 || 'Endereço Pendente',
            number: order?.recipient_address?.address_line3 || '0',
            neighborhood: order?.recipient_address?.address_line1 || 'Centro',
            complement: order?.recipient_address?.address_line4 || '',
        };
        let selectedSla = null;
        let shippingEstimate = '10d';
        let price = 0;
        try {
            this.logger.info({
                items: mappedItems.map(i => ({ id: i.id, quantity: i.quantity })),
                postalCode: address.postalCode,
                country: address.country
            }, 'Simulating order with VTEX');
            const simulation = await this.vtexClient.simulateOrder(mappedItems, address.postalCode, address.country);
            this.logger.info({ simulationResult: simulation.data }, 'VTEX Simulation Result');
            const logisticsInfo = simulation.data?.logisticsInfo?.[0];
            const availableSla = logisticsInfo?.slas?.[0];
            if (availableSla) {
                selectedSla = availableSla.id;
                shippingEstimate = availableSla.shippingEstimate;
                price = availableSla.price;
                this.logger.info({ orderId: order?.id ?? order?.order_id, selectedSla, shippingEstimate, price }, 'Selected SLA from simulation');
            }
            else {
                this.logger.warn({ orderId: order?.id ?? order?.order_id, logisticsInfo }, 'No SLA found in simulation');
            }
        }
        catch (e) {
            this.logger.error({ err: e, orderId: order?.id ?? order?.order_id }, 'Failed to simulate order');
        }
        if (!selectedSla) {
            const msg = `No valid SLA found for order. Check logistics configuration for SKU(s) ${mappedItems.map(i => i.id).join(',')} and Postal Code ${address.postalCode}`;
            this.logger.error(msg);
            throw new Error(msg);
        }
        return [
            {
                marketplaceOrderId: order?.id ?? order?.order_id,
                marketplaceServicesEndpoint: 'TikTokShop',
                marketplacePaymentValue: order?.payment?.total_amount ?? order?.payment?.total ?? 0,
                items: mappedItems,
                clientProfileData: {
                    firstName: order?.buyer_email?.split('@')[0] ?? 'TikTok',
                    lastName: 'Buyer',
                    email: order?.buyer_email ?? 'no-reply@tiktokshop.com',
                    phone: '11999999999',
                    documentType: 'cpf',
                    document: '00000000000',
                },
                shippingData: {
                    address,
                    selectedSla,
                    logisticsInfo: mappedItems.map((item, index) => ({
                        itemIndex: index,
                        selectedSla,
                        price: 0,
                        shippingEstimate: '10d',
                        lockTTL: '1bd',
                    })),
                },
                paymentData: {
                    payments: [
                        {
                            paymentSystem: '201',
                            paymentSystemName: 'TikTok',
                            group: 'creditCard',
                            installments: 1,
                            value: order?.payment?.total_amount ?? order?.payment?.total ?? 0,
                        },
                    ],
                },
            }
        ];
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