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
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const promises_1 = require("timers/promises");
const nestjs_pino_1 = require("nestjs-pino");
const idempotency_service_1 = require("../common/idempotency.service");
const prisma_service_1 = require("../prisma/prisma.service");
const tiktok_order_client_1 = require("./tiktok-order.client");
const vtex_orders_client_1 = require("./vtex-orders.client");
const logistics_service_1 = require("../logistics/logistics.service");
const shop_config_service_1 = require("../common/shop-config.service");
const utils_1 = require("../common/utils");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(tiktokClient, vtexClient, idempotency, prisma, configService, shopConfigService, logisticsService, logger) {
        this.tiktokClient = tiktokClient;
        this.vtexClient = vtexClient;
        this.idempotency = idempotency;
        this.prisma = prisma;
        this.configService = configService;
        this.shopConfigService = shopConfigService;
        this.logisticsService = logisticsService;
        this.logger = logger;
        this.logger.setContext(OrdersService_1.name);
        const trigger = this.configService.get('TTS_LABEL_TRIGGER', {
            infer: true,
        });
        this.labelTrigger = trigger === 'invoice' ? 'invoice' : 'immediate';
    }
    async handleWebhook(payload) {
        const shopId = payload.shop_id;
        const orderId = payload.data.order_id;
        const eventType = payload.type;
        const statusHint = payload.data?.order_status ?? payload.data?.status ?? 'unknown';
        const idempotencyKey = `tiktok-order:${eventType}:${statusHint}:${orderId}`;
        this.logger.info({ shopId, orderId, eventType }, 'Processing TikTok order webhook');
        return this.idempotency.register(idempotencyKey, payload, async () => {
            try {
                const orderDetailsResponse = await this.tiktokClient.getOrder(shopId, orderId);
                const orderDetails = orderDetailsResponse.data?.data?.orders?.[0] ??
                    orderDetailsResponse.data?.data ??
                    orderDetailsResponse.data;
                this.logger.info({ orderId, status: orderDetails?.status }, 'Fetched TikTok order details');
                this.logOrderSnapshot(orderDetails, orderId);
                const recipientInfo = this.resolveRecipientAddress(orderDetails);
                const recipient = recipientInfo?.address ?? {};
                const rawPostalCode = this.extractPostalCandidates(orderDetails, recipient).find((value) => value !== undefined && value !== null && String(value).trim() !== '');
                const normalizedPostalCode = rawPostalCode
                    ? String(rawPostalCode).replace(/\D/g, '').trim()
                    : '';
                if (normalizedPostalCode.length !== 8) {
                    this.logger.warn({
                        orderId,
                        status: orderDetails?.status ?? statusHint,
                        rawPostalCode,
                        normalizedPostalCode,
                        recipientSource: recipientInfo?.source ?? 'unknown',
                    }, 'Skipping order due to missing recipient postal code');
                    return;
                }
                const skipStatuses = ['CANCELLED', 'CANCEL_REQUESTED'];
                if (skipStatuses.includes(orderDetails?.status)) {
                    this.logger.info({ orderId, status: orderDetails?.status }, 'Skipping order - not ready for fulfillment');
                    return;
                }
                let vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId, {
                    priceMode: 'selling',
                });
                let vtexResponse;
                try {
                    vtexResponse = await this.vtexClient.createOrder(shopId, vtexPayload);
                    const responseData = vtexResponse.data;
                    const firstOrder = Array.isArray(responseData) ? responseData[0] : responseData;
                    const vtexOrderId = firstOrder?.orderId ?? firstOrder?.id ?? null;
                    this.logger.info({ orderId, vtexOrderId }, 'Created VTEX order successfully');
                    const orderStatus = this.labelTrigger === 'invoice' ? 'awaiting_invoice' : 'imported';
                    await this.prisma.orderMap.upsert({
                        where: { ttsOrderId: orderId },
                        update: {
                            vtexOrderId,
                            status: orderStatus,
                            lastError: null,
                            shopId,
                        },
                        create: {
                            ttsOrderId: orderId,
                            shopId,
                            vtexOrderId,
                            status: orderStatus,
                        },
                    });
                    try {
                        this.logger.info({ orderId, vtexOrderId }, 'Waiting before VTEX dispatch authorization');
                        await (0, promises_1.setTimeout)(15_000);
                        await this.vtexClient.authorizeDispatch(shopId, vtexOrderId);
                        this.logger.info({ orderId, vtexOrderId }, 'VTEX dispatch authorized');
                    }
                    catch (authorizeError) {
                        this.logger.error({ err: authorizeError, orderId, vtexOrderId }, 'Failed to authorize VTEX dispatch');
                    }
                    if (this.labelTrigger === 'invoice') {
                        this.logger.info({ orderId, vtexOrderId }, 'Label generation deferred until invoice notification');
                    }
                    else {
                        this.logger.info({ orderId, orderValue: orderDetails?.payment?.total }, 'Initiating label generation');
                        await this.logisticsService.generateLabel(shopId, orderId, orderDetails?.payment?.total ?? 0);
                    }
                    this.logger.info({ orderId, vtexOrderId }, 'TikTok order processed successfully');
                }
                catch (vtexError) {
                    if (this.isVtexPaymentMismatch(vtexError)) {
                        this.logger.warn({
                            orderId,
                            errorResponse: vtexError?.response?.data,
                        }, 'VTEX rejected payment totals; retrying with full price mode');
                        vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId, {
                            priceMode: 'price',
                        });
                        vtexResponse = await this.vtexClient.createOrder(shopId, vtexPayload);
                        const responseData = vtexResponse.data;
                        const firstOrder = Array.isArray(responseData) ? responseData[0] : responseData;
                        const vtexOrderId = firstOrder?.orderId ?? firstOrder?.id ?? null;
                        this.logger.info({ orderId, vtexOrderId }, 'Created VTEX order successfully after price fallback');
                        const orderStatus = this.labelTrigger === 'invoice' ? 'awaiting_invoice' : 'imported';
                        await this.prisma.orderMap.upsert({
                            where: { ttsOrderId: orderId },
                            update: {
                                vtexOrderId,
                                status: orderStatus,
                                lastError: null,
                                shopId,
                            },
                            create: {
                                ttsOrderId: orderId,
                                shopId,
                                vtexOrderId,
                                status: orderStatus,
                            },
                        });
                        try {
                            this.logger.info({ orderId, vtexOrderId }, 'Waiting before VTEX dispatch authorization');
                            await (0, promises_1.setTimeout)(15_000);
                            await this.vtexClient.authorizeDispatch(shopId, vtexOrderId);
                            this.logger.info({ orderId, vtexOrderId }, 'VTEX dispatch authorized');
                        }
                        catch (authorizeError) {
                            this.logger.error({ err: authorizeError, orderId, vtexOrderId }, 'Failed to authorize VTEX dispatch');
                        }
                        if (this.labelTrigger === 'invoice') {
                            this.logger.info({ orderId, vtexOrderId }, 'Label generation deferred until invoice notification');
                        }
                        else {
                            this.logger.info({ orderId, orderValue: orderDetails?.payment?.total }, 'Initiating label generation');
                            await this.logisticsService.generateLabel(shopId, orderId, orderDetails?.payment?.total ?? 0);
                        }
                        this.logger.info({ orderId, vtexOrderId }, 'TikTok order processed successfully after price fallback');
                        return;
                    }
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
    scheduleVtexMarketplaceNotification(payload, shopId) {
        setImmediate(() => {
            this.handleVtexMarketplaceNotification(payload, shopId).catch((error) => {
                this.logger.error({ err: error, shopId }, 'Failed to process VTEX marketplace notification');
            });
        });
    }
    async handleVtexMarketplaceNotification(payload, shopId) {
        if (!payload || typeof payload !== 'object') {
            this.logger.warn({ payload, shopId }, 'Received empty VTEX marketplace notification');
            return;
        }
        if (payload.hookConfig === 'ping') {
            this.logger.info({ shopId }, 'Received VTEX marketplace hook ping');
            return;
        }
        const event = this.resolveMarketplaceEvent(payload);
        const idempotencyKey = this.buildMarketplaceIdempotencyKey(event, payload, shopId);
        await this.idempotency.register(idempotencyKey, payload, async () => {
            const mapping = await this.resolveOrderMapping(event, shopId);
            if (!mapping) {
                this.logger.warn({ shopId, event, payload }, 'VTEX marketplace notification did not match any order mapping');
                return;
            }
            const vtexOrderId = mapping.vtexOrderId ?? event.vtexOrderId;
            if (!vtexOrderId) {
                this.logger.warn({ shopId, event, ttsOrderId: mapping.ttsOrderId }, 'VTEX marketplace notification missing vtexOrderId');
                return;
            }
            if (mapping.labelUrl) {
                this.logger.info({ shopId, orderId: mapping.ttsOrderId, vtexOrderId }, 'Label already generated; skipping marketplace notification');
                return;
            }
            const orderResponse = await this.vtexClient.getOrder(shopId, vtexOrderId);
            const orderData = orderResponse.data ?? {};
            const invoice = this.extractInvoiceData(orderData);
            if (!invoice) {
                this.logger.info({ shopId, orderId: mapping.ttsOrderId, vtexOrderId, status: event.status }, 'Marketplace notification received but no invoice found yet');
                return;
            }
            await this.prisma.orderMap.update({
                where: { ttsOrderId: mapping.ttsOrderId },
                data: {
                    status: 'invoiced',
                    lastError: null,
                    shopId,
                },
            });
            const orderValue = this.resolveOrderValue(orderData);
            const invoiceId = invoice?.key ?? invoice?.number ?? 'unknown';
            const uploadKey = `tiktok-invoice-upload:${mapping.ttsOrderId}:${invoiceId}`;
            const uploadResult = await this.idempotency.register(uploadKey, { ttsOrderId: mapping.ttsOrderId, invoiceId }, async () => {
                await this.uploadInvoiceToTikTok(shopId, mapping.ttsOrderId, orderData, invoice);
            });
            if (uploadResult === 'skipped') {
                this.logger.info({ shopId, orderId: mapping.ttsOrderId, vtexOrderId, invoiceId }, 'Invoice already uploaded to TikTok; proceeding with label generation');
            }
            this.logger.info({
                shopId,
                orderId: mapping.ttsOrderId,
                vtexOrderId,
                invoiceNumber: invoice?.number,
            }, 'Generating label after invoice notification');
            await this.logisticsService.generateLabel(shopId, mapping.ttsOrderId, orderValue, invoice ?? undefined);
        });
    }
    async buildVtexOrderPayload(order, shopId, options) {
        const items = Array.isArray(order?.line_items)
            ? order.line_items
            : Array.isArray(order?.items)
                ? order.items
                : [];
        this.logger.info({
            orderId: order?.id ?? order?.order_id,
            lineItemsCount: items.length,
            lineItems: items.map((item) => ({
                sku_id: item?.sku_id,
                product_id: item?.product_id,
                seller_sku: item?.seller_sku,
                quantity: item?.quantity,
            })),
        }, 'TikTok order line items snapshot');
        const mappedItems = [];
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const toCents = (value) => {
            if (value === null || value === undefined) {
                return 0;
            }
            const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
            const numeric = Number(normalized);
            if (!Number.isFinite(numeric)) {
                return 0;
            }
            return Math.round(numeric * 100);
        };
        const normalizeQuantity = (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
                return 1;
            }
            return Math.floor(numeric);
        };
        for (const item of items) {
            const ttsSkuId = item?.sku_id !== undefined && item?.sku_id !== null
                ? String(item.sku_id)
                : undefined;
            const ttsProductId = item?.product_id !== undefined && item?.product_id !== null
                ? String(item.product_id)
                : undefined;
            const sellerSku = item?.seller_sku !== undefined && item?.seller_sku !== null
                ? String(item.seller_sku)
                : undefined;
            let mapping = ttsSkuId
                ? await this.prisma.productMap.findFirst({
                    where: { shopId, ttsSkuId },
                })
                : null;
            if (!mapping && ttsProductId) {
                const productMappings = await this.prisma.productMap.findMany({
                    where: { shopId, ttsProductId },
                });
                if (productMappings.length === 1) {
                    mapping = productMappings[0];
                }
                else if (productMappings.length > 1) {
                    if (sellerSku) {
                        mapping = productMappings.find((candidate) => candidate.vtexSkuId === sellerSku) ?? null;
                    }
                    if (!mapping) {
                        this.logger.warn({
                            shopId,
                            ttsSkuId,
                            ttsProductId,
                            sellerSku,
                            candidateVtexSkuIds: productMappings.map((candidate) => candidate.vtexSkuId),
                        }, 'Ambiguous product mapping for TikTok item; skipping');
                    }
                }
            }
            if (!mapping) {
                if (sellerSku) {
                    this.logger.info({ skuId: ttsSkuId, sellerSku }, 'Mapping not found, trying to use seller_sku as VTEX ID');
                    try {
                        await this.prisma.productMap.upsert({
                            where: { vtexSkuId: sellerSku },
                            update: {
                                ttsSkuId: ttsSkuId ?? null,
                                ttsProductId: ttsProductId ?? null,
                                shopId,
                            },
                            create: {
                                shopId,
                                vtexSkuId: sellerSku,
                                ttsSkuId: ttsSkuId ?? null,
                                ttsProductId: ttsProductId ?? null,
                                status: 'auto_mapped',
                            }
                        });
                    }
                    catch (e) {
                        this.logger.warn({ err: e }, 'Failed to auto-create product mapping');
                    }
                    mappedItems.push({
                        id: sellerSku,
                        quantity: normalizeQuantity(item.quantity),
                        seller: '1',
                        price: toCents(item.sale_price ?? item.original_price ?? item.price ?? 0),
                    });
                    continue;
                }
                this.logger.warn({ skuId: ttsSkuId, productId: ttsProductId }, 'Unable to find product mapping for TikTok item; skipping');
                continue;
            }
            mappedItems.push({
                id: mapping.vtexSkuId,
                quantity: normalizeQuantity(item.quantity),
                seller: '1',
                price: toCents(item.sale_price ?? item.original_price ?? item.price ?? 0),
            });
        }
        const recipientInfo = this.resolveRecipientAddress(order);
        const recipient = recipientInfo?.address ?? {};
        const rawPostalCode = this.extractPostalCandidates(order, recipient).find((value) => value !== undefined && value !== null && String(value).trim() !== '');
        const normalizedPostalCode = rawPostalCode
            ? String(rawPostalCode).replace(/\D/g, '').trim()
            : '';
        const postalCode = normalizedPostalCode.length === 8 ? normalizedPostalCode : '01001000';
        if (normalizedPostalCode.length !== 8) {
            this.logger.warn({
                orderId: order?.id ?? order?.order_id,
                rawPostalCode,
                normalizedPostalCode,
                recipientSource: recipientInfo?.source ?? 'unknown',
            }, 'Invalid or missing postal code; using fallback 01001000');
        }
        const rawCountry = recipient.region_code ??
            recipient.country ??
            recipient.country_code ??
            recipient.country_region ??
            null;
        const normalizedCountry = rawCountry
            ? String(rawCountry).trim().toUpperCase()
            : '';
        const country = normalizedCountry === 'BR'
            ? 'BRA'
            : normalizedCountry.length === 3
                ? normalizedCountry
                : 'BRA';
        const documentInfo = this.resolveDocument(order);
        const address = {
            addressType: 'residential',
            receiverName: recipient.name || 'TikTok Buyer',
            postalCode,
            city: recipient.district_info?.find((d) => d.address_level === 'L2')
                ?.address_name ||
                recipient.city ||
                recipient.town ||
                'São Paulo',
            state: recipient.district_info?.find((d) => d.address_level === 'L1')
                ?.address_name ||
                recipient.state ||
                recipient.province ||
                'SP',
            country,
            street: recipient.address_line2 ||
                recipient.address_line1 ||
                recipient.address_detail ||
                recipient.detail_address ||
                'Endereço Pendente',
            number: recipient.address_line3 ||
                recipient.street_number ||
                recipient.number ||
                '0',
            neighborhood: recipient.address_line1 ||
                recipient.district ||
                recipient.address_line2 ||
                'Centro',
            complement: recipient.address_line4 || recipient.address_extra || '',
        };
        let selectedSla = null;
        let shippingEstimate = '10d';
        let shippingTotalCents = 0;
        let logisticsInfoPayload = [];
        let simulation = null;
        try {
            this.logger.info({
                items: mappedItems.map(i => ({ id: i.id, quantity: i.quantity })),
                postalCode: address.postalCode,
                country: address.country,
                postalCodeRaw: rawPostalCode,
            }, 'Simulating order with VTEX');
            simulation = await this.vtexClient.simulateOrder(shopId, mappedItems, address.postalCode, address.country);
            this.logger.info({ simulationResult: simulation.data }, 'VTEX Simulation Result');
            const logisticsEntries = Array.isArray(simulation.data?.logisticsInfo)
                ? simulation.data.logisticsInfo
                : [];
            const defaultSlaId = logisticsEntries[0]?.slas?.[0]?.id ?? null;
            if (defaultSlaId) {
                selectedSla = defaultSlaId;
            }
            logisticsInfoPayload = [];
            shippingTotalCents = 0;
            logisticsEntries.forEach((entry, index) => {
                const slas = Array.isArray(entry?.slas) ? entry.slas : [];
                if (!slas.length) {
                    return;
                }
                let sla = (selectedSla ? slas.find((s) => s?.id === selectedSla) : null) ??
                    slas[0];
                if (!sla) {
                    return;
                }
                if (!selectedSla) {
                    selectedSla = sla.id;
                }
                if (sla.id !== selectedSla) {
                    this.logger.warn({
                        orderId: order?.id ?? order?.order_id,
                        itemIndex: index,
                        expectedSla: selectedSla,
                        resolvedSla: sla.id,
                    }, 'Item did not include selected SLA; using fallback SLA');
                }
                const slaPrice = Number(sla.price) || 0;
                shippingTotalCents += slaPrice;
                shippingEstimate = sla.shippingEstimate ?? shippingEstimate;
                logisticsInfoPayload.push({
                    itemIndex: index,
                    selectedSla: sla.id,
                    price: slaPrice,
                    shippingEstimate: sla.shippingEstimate ?? shippingEstimate,
                    lockTTL: sla.lockTTL ?? '1bd',
                });
            });
            if (selectedSla) {
                this.logger.info({
                    orderId: order?.id ?? order?.order_id,
                    selectedSla,
                    shippingEstimate,
                    shippingTotalCents,
                    logisticsCount: logisticsInfoPayload.length,
                }, 'Selected SLA from simulation');
            }
            else {
                this.logger.warn({ orderId: order?.id ?? order?.order_id, logisticsEntries }, 'No SLA found in simulation');
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
        const simulationItems = Array.isArray(simulation?.data?.items)
            ? simulation.data.items
            : [];
        const pricingBySkuId = this.resolveSimulationPricing(simulationItems, {
            priceMode: options?.priceMode ?? 'selling',
        });
        const pricedItems = mappedItems.map((item) => {
            const pricing = pricingBySkuId.get(String(item.id));
            const priceTags = pricing?.priceTags;
            return {
                ...item,
                price: pricing?.basePrice ?? item.price,
                ...(priceTags && priceTags.length ? { priceTags } : {}),
            };
        });
        const itemsTotalCents = pricedItems.reduce((sum, item) => {
            const pricing = pricingBySkuId.get(String(item.id));
            const unitTotal = pricing?.finalPrice ?? item.price;
            return sum + (Number(unitTotal) || 0) * item.quantity;
        }, 0);
        const paymentTotalCents = itemsTotalCents + shippingTotalCents;
        if (paymentTotalCents <= 0) {
            this.logger.warn({
                orderId: order?.id ?? order?.order_id,
                itemsTotalCents,
                shippingTotalCents,
            }, 'Computed payment total is zero or invalid; check pricing and simulation data');
        }
        const logisticsInfo = logisticsInfoPayload.length > 0
            ? logisticsInfoPayload
            : pricedItems.map((_, index) => ({
                itemIndex: index,
                selectedSla: selectedSla ?? 'STANDARD',
                price: index === 0 ? shippingTotalCents : 0,
                shippingEstimate,
                lockTTL: '1bd',
            }));
        const marketplaceServicesEndpoint = this.resolveMarketplaceServicesEndpoint(vtexConfig);
        const paymentSystemId = vtexConfig.paymentSystemId ?? '201';
        const paymentSystemName = vtexConfig.paymentSystemName;
        const paymentGroup = vtexConfig.paymentGroup;
        const paymentMerchant = vtexConfig.paymentMerchant;
        const payment = {
            paymentSystem: paymentSystemId,
            installments: 1,
            value: paymentTotalCents,
            referenceValue: paymentTotalCents,
        };
        if (paymentSystemName) {
            payment.paymentSystemName = paymentSystemName;
        }
        if (paymentGroup) {
            payment.group = paymentGroup;
        }
        if (paymentMerchant) {
            payment.merchantName = paymentMerchant;
        }
        return [
            {
                marketplaceOrderId: order?.id ?? order?.order_id,
                marketplaceServicesEndpoint,
                marketplacePaymentValue: paymentTotalCents,
                items: pricedItems,
                clientProfileData: {
                    ...this.resolveBuyerProfile(order, recipient),
                    documentType: documentInfo.type,
                    document: documentInfo.value,
                },
                shippingData: {
                    address,
                    selectedSla,
                    logisticsInfo,
                },
                paymentData: {
                    payments: [payment],
                },
            }
        ];
    }
    resolveSimulationPricing(simulationItems, options) {
        const pricingBySkuId = new Map();
        for (const item of simulationItems) {
            const id = item?.id ?? item?.itemId ?? item?.skuId;
            if (!id)
                continue;
            const basePrice = Number(item?.price ?? item?.listPrice);
            const sellingPrice = Number(item?.sellingPrice ??
                item?.priceDefinition?.calculatedSellingPrice ??
                item?.priceDefinition?.total);
            const rawTags = Array.isArray(item?.priceTags) ? item.priceTags : [];
            const priceTags = options.priceMode === 'selling' ? this.sanitizePriceTags(rawTags) : [];
            const tagTotal = priceTags.reduce((sum, tag) => sum + (Number(tag.value) || 0), 0);
            let finalPrice = basePrice;
            if (options.priceMode === 'selling') {
                if (Number.isFinite(basePrice) && priceTags.length) {
                    finalPrice = basePrice + tagTotal;
                }
                else if (Number.isFinite(sellingPrice) && sellingPrice > 0) {
                    finalPrice = sellingPrice;
                }
            }
            else if (Number.isFinite(basePrice) && basePrice > 0) {
                finalPrice = basePrice;
            }
            else if (Number.isFinite(sellingPrice) && sellingPrice > 0) {
                finalPrice = sellingPrice;
            }
            if (Number.isFinite(basePrice) && basePrice > 0) {
                pricingBySkuId.set(String(id), {
                    basePrice,
                    finalPrice: Number.isFinite(finalPrice) ? finalPrice : basePrice,
                    ...(priceTags.length ? { priceTags } : {}),
                });
            }
        }
        return pricingBySkuId;
    }
    sanitizePriceTags(tags) {
        return tags
            .map((tag) => ({
            name: String(tag?.name ?? ''),
            value: Number(tag?.value ?? 0),
            isPercentual: typeof tag?.isPercentual === 'boolean' ? tag.isPercentual : undefined,
            identifier: tag?.identifier ?? undefined,
            rawValue: tag?.rawValue !== undefined && tag?.rawValue !== null
                ? Number(tag.rawValue)
                : undefined,
        }))
            .filter((tag) => tag.name && Number.isFinite(tag.value));
    }
    isVtexPaymentMismatch(error) {
        const code = error?.response?.data?.error?.code;
        return code === 'FMT007';
    }
    logOrderSnapshot(order, orderId) {
        if (!order || typeof order !== 'object') {
            return;
        }
        const status = order?.status ?? order?.order_status ?? 'unknown';
        const recipientInfo = this.resolveRecipientAddress(order);
        const recipient = recipientInfo?.address ?? null;
        const recipientKeys = recipient && typeof recipient === 'object' ? Object.keys(recipient) : [];
        const postalCandidates = this.extractPostalCandidates(order, recipient ?? {});
        const postalHints = postalCandidates
            .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
            .map((value) => {
            const normalized = String(value).replace(/\D/g, '');
            return {
                length: normalized.length,
                suffix: normalized.slice(-3),
            };
        });
        const docCandidates = this.extractDocumentCandidates(order);
        const docHints = docCandidates
            .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
            .map((value) => {
            const normalized = String(value).replace(/\D/g, '');
            return {
                length: normalized.length,
                suffix: normalized.slice(-3),
            };
        });
        this.logger.info({
            orderId,
            status,
            recipientSource: recipientInfo?.source ?? 'unknown',
            recipientKeys,
            postalHints,
            docHints,
            hasLineItems: Array.isArray(order?.line_items) || Array.isArray(order?.items),
        }, 'TikTok order snapshot');
    }
    resolveRecipientAddress(order) {
        const candidates = [
            { source: 'recipient_address', value: order?.recipient_address },
            {
                source: 'recipient_address_list',
                value: Array.isArray(order?.recipient_address_list)
                    ? order.recipient_address_list[0]
                    : undefined,
            },
            { source: 'shipping_address', value: order?.shipping_address },
            {
                source: 'shipping_address_list',
                value: Array.isArray(order?.shipping_address_list)
                    ? order.shipping_address_list[0]
                    : undefined,
            },
            { source: 'buyer_address', value: order?.buyer_address },
            { source: 'address', value: order?.address },
            { source: 'recipient', value: order?.recipient?.address ?? order?.recipient },
            { source: 'shipping', value: order?.shipping?.address ?? order?.shipping },
        ];
        for (const candidate of candidates) {
            if (!candidate.value || typeof candidate.value !== 'object') {
                continue;
            }
            if (this.isAddressLike(candidate.value)) {
                return { address: candidate.value, source: candidate.source };
            }
        }
        return null;
    }
    isAddressLike(value) {
        return Boolean(value?.postal_code ||
            value?.zip_code ||
            value?.postcode ||
            value?.address_line1 ||
            value?.address_line2 ||
            value?.city ||
            value?.state);
    }
    extractPostalCandidates(order, recipient) {
        return [
            recipient?.postal_code,
            recipient?.zip_code,
            recipient?.zipcode,
            recipient?.postcode,
            recipient?.post_code,
            recipient?.zip,
            order?.postal_code,
            order?.zip_code,
            order?.postcode,
            order?.buyer_address?.postal_code,
            order?.shipping_address?.postal_code,
        ];
    }
    resolveDocument(order) {
        const candidates = this.extractDocumentCandidates(order);
        const raw = candidates.find((value) => value !== undefined && value !== null);
        const normalized = raw ? String(raw).replace(/\D/g, '').trim() : '';
        if (normalized.length === 11 && this.isValidCpf(normalized)) {
            return { type: 'cpf', value: normalized };
        }
        if (normalized.length === 14 && this.isValidCnpj(normalized)) {
            return { type: 'cnpj', value: normalized };
        }
        const seed = `${order?.buyer_email ?? ''}:${order?.id ?? order?.order_id ?? ''}`;
        const generated = this.generateCpfFromSeed(seed);
        this.logger.warn({
            orderId: order?.id ?? order?.order_id,
            documentSource: raw ? 'order' : 'missing',
            documentLength: normalized.length || 0,
        }, 'Invalid or missing document; using generated CPF');
        return { type: 'cpf', value: generated };
    }
    extractDocumentCandidates(order) {
        return [
            order?.cpf,
            order?.buyer_cpf,
            order?.buyer_tax_number,
            order?.buyer_tax_id,
            order?.buyer_document,
            order?.buyer_id_number,
            order?.buyer_identity_number,
            order?.buyer?.tax_id,
            order?.buyer?.taxId,
            order?.buyer?.tax_number,
            order?.buyer?.taxNumber,
            order?.buyer?.document,
            order?.buyer?.document_number,
            order?.buyer?.cpf,
            order?.buyer?.cnpj,
            order?.buyer_info?.tax_id,
            order?.buyer_info?.taxId,
            order?.buyer_info?.tax_number,
            order?.buyer_info?.document,
            order?.recipient_address?.tax_id,
            order?.recipient_address?.taxId,
            order?.recipient_address?.tax_number,
            order?.recipient_address?.taxNumber,
            order?.recipient_address?.document,
            order?.recipient_address?.document_number,
            order?.recipient_address?.cpf,
            order?.recipient_address?.cnpj,
            order?.recipient_address?.id_number,
            order?.recipient_address?.identity_number,
            order?.recipient_address?.id_card_number,
            order?.recipient_address_list?.[0]?.tax_id,
            order?.recipient_address_list?.[0]?.tax_number,
            order?.recipient_address_list?.[0]?.document,
            order?.shipping_address?.tax_id,
            order?.shipping_address?.tax_number,
            order?.shipping_address?.document,
        ];
    }
    resolveBuyerProfile(order, recipient) {
        const email = typeof order?.buyer_email === 'string' && order.buyer_email.includes('@')
            ? order.buyer_email
            : 'no-reply@tiktokshop.com';
        const nameCandidate = order?.cpf_name ||
            recipient?.name ||
            [recipient?.first_name, recipient?.last_name].filter(Boolean).join(' ') ||
            email.split('@')[0] ||
            'TikTok Buyer';
        const { firstName, lastName } = this.splitName(nameCandidate);
        return {
            firstName,
            lastName,
            email,
            phone: this.resolveBuyerPhone(order, recipient),
        };
    }
    resolveBuyerPhone(order, recipient) {
        const candidates = [
            recipient?.phone_number,
            recipient?.phone,
            recipient?.mobile_phone,
            order?.buyer_phone,
            order?.buyer_phone_number,
            order?.buyer_mobile,
            order?.buyer_mobile_phone,
        ];
        for (const candidate of candidates) {
            if (!candidate)
                continue;
            const digits = String(candidate).replace(/\D/g, '');
            if (digits.length >= 10) {
                return digits;
            }
        }
        return '11999999999';
    }
    splitName(name) {
        const trimmed = name?.toString().trim();
        if (!trimmed) {
            return { firstName: 'TikTok', lastName: 'Buyer' };
        }
        const parts = trimmed.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
            return { firstName: parts[0], lastName: 'Buyer' };
        }
        return {
            firstName: parts[0],
            lastName: parts.slice(1).join(' '),
        };
    }
    generateCpfFromSeed(seed) {
        const digits = this.digitsFromSeed(seed, 9);
        const firstDigit = this.computeCpfDigit(digits, 10);
        const secondDigit = this.computeCpfDigit([...digits, firstDigit], 11);
        return [...digits, firstDigit, secondDigit].join('');
    }
    digitsFromSeed(seed, count) {
        const hash = (0, crypto_1.createHash)('sha256').update(seed || 'fallback').digest('hex');
        const digits = [];
        for (const ch of hash) {
            digits.push(parseInt(ch, 16) % 10);
            if (digits.length >= count) {
                break;
            }
        }
        if (digits.length < count) {
            while (digits.length < count) {
                digits.push(0);
            }
        }
        if (digits.every((value) => value === digits[0])) {
            digits[0] = (digits[0] + 1) % 10;
        }
        return digits;
    }
    computeCpfDigit(digits, factor) {
        let sum = 0;
        for (const digit of digits) {
            sum += digit * factor;
            factor -= 1;
        }
        const mod = (sum * 10) % 11;
        return mod === 10 ? 0 : mod;
    }
    isValidCpf(value) {
        if (value.length !== 11) {
            return false;
        }
        if (/^(\d)\1{10}$/.test(value)) {
            return false;
        }
        const digits = value.split('').map((d) => Number(d));
        const firstDigit = this.computeCpfDigit(digits.slice(0, 9), 10);
        const secondDigit = this.computeCpfDigit(digits.slice(0, 10), 11);
        return digits[9] === firstDigit && digits[10] === secondDigit;
    }
    isValidCnpj(value) {
        if (value.length !== 14) {
            return false;
        }
        if (/^(\d)\1{13}$/.test(value)) {
            return false;
        }
        const digits = value.split('').map((d) => Number(d));
        const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const calcDigit = (base, weights) => {
            const sum = base.reduce((acc, digit, index) => acc + digit * weights[index], 0);
            const mod = sum % 11;
            return mod < 2 ? 0 : 11 - mod;
        };
        const firstDigit = calcDigit(digits.slice(0, 12), weights1);
        const secondDigit = calcDigit(digits.slice(0, 13), weights2);
        return digits[12] === firstDigit && digits[13] === secondDigit;
    }
    resolveMarketplaceServicesEndpoint(vtexConfig) {
        const explicit = vtexConfig.marketplaceServicesEndpoint;
        if (explicit) {
            return explicit;
        }
        const baseUrl = this.configService.get('PUBLIC_BASE_URL', { infer: true });
        const token = vtexConfig.webhookToken;
        if (baseUrl && token) {
            return `${baseUrl.replace(/\/+$/, '')}/webhooks/vtex/marketplace/${token}`;
        }
        return baseUrl ?? 'TikTokShop';
    }
    resolveMarketplaceEvent(payload) {
        const status = payload.status ??
            payload.state ??
            payload.currentState ??
            payload.orderStatus ??
            payload.workflowStatus ??
            payload.data?.status ??
            payload.data?.state ??
            payload.data?.orderStatus;
        const vtexOrderId = payload.orderId ??
            payload.order_id ??
            payload.vtexOrderId ??
            payload.data?.orderId ??
            payload.data?.order_id ??
            payload.data?.vtexOrderId ??
            payload.order?.orderId ??
            payload.order?.id ??
            payload.order?.order_id;
        const marketplaceOrderId = payload.marketplaceOrderId ??
            payload.marketplace_order_id ??
            payload.data?.marketplaceOrderId ??
            payload.data?.marketplace_order_id ??
            payload.marketplace?.orderId ??
            payload.marketplace?.order_id ??
            payload.order?.marketplaceOrderId ??
            payload.order?.marketplace_order_id;
        return {
            status: status ? String(status).trim().toLowerCase() : undefined,
            vtexOrderId: vtexOrderId ? String(vtexOrderId) : undefined,
            marketplaceOrderId: marketplaceOrderId ? String(marketplaceOrderId) : undefined,
        };
    }
    buildMarketplaceIdempotencyKey(event, payload, shopId) {
        const baseId = event.vtexOrderId ??
            event.marketplaceOrderId ??
            (payload?.id ? String(payload.id) : undefined) ??
            (0, utils_1.createPayloadHash)(payload);
        const status = event.status ?? 'unknown';
        return `vtex-marketplace:${shopId}:${status}:${baseId}`;
    }
    async resolveOrderMapping(event, shopId) {
        if (event.marketplaceOrderId) {
            const mapping = await this.prisma.orderMap.findUnique({
                where: { ttsOrderId: event.marketplaceOrderId },
            });
            if (mapping) {
                return mapping;
            }
        }
        if (event.vtexOrderId) {
            const mapping = await this.prisma.orderMap.findFirst({
                where: { vtexOrderId: event.vtexOrderId, shopId },
            });
            if (mapping) {
                return mapping;
            }
        }
        return null;
    }
    extractInvoiceData(order) {
        if (!order || typeof order !== 'object') {
            return null;
        }
        const candidates = [];
        if (Array.isArray(order?.invoiceData?.invoices)) {
            candidates.push(...order.invoiceData.invoices);
        }
        if (order?.invoiceData && typeof order.invoiceData === 'object') {
            candidates.push(order.invoiceData);
        }
        if (Array.isArray(order?.packageAttachment?.packages)) {
            candidates.push(...order.packageAttachment.packages);
        }
        if (order?.packageAttachment && typeof order.packageAttachment === 'object') {
            candidates.push(order.packageAttachment);
        }
        if (order?.invoices && Array.isArray(order.invoices)) {
            candidates.push(...order.invoices);
        }
        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object')
                continue;
            const number = candidate.invoiceNumber ??
                candidate.invoice_number ??
                candidate.number ??
                candidate.number_nf;
            const key = candidate.invoiceKey ??
                candidate.invoice_key ??
                candidate.key ??
                candidate.nfeKey;
            const issuanceDate = candidate.issuanceDate ??
                candidate.issuance_date ??
                candidate.date;
            const value = candidate.invoiceValue ?? candidate.value ?? candidate.total;
            if (number || key) {
                return {
                    number: number ? String(number) : undefined,
                    key: key ? String(key) : undefined,
                    issuanceDate: issuanceDate ? String(issuanceDate) : undefined,
                    value: Number.isFinite(Number(value)) ? Number(value) : undefined,
                };
            }
        }
        return null;
    }
    async uploadInvoiceToTikTok(shopId, ttsOrderId, orderData, invoice) {
        const fileBase64 = await this.resolveInvoiceFileBase64(orderData, shopId);
        if (!fileBase64) {
            throw new Error('Invoice XML not found or not retrievable for TikTok upload');
        }
        const packageId = await this.resolveTiktokPackageId(shopId, ttsOrderId);
        if (!packageId) {
            throw new Error('TikTok package_id not found for invoice upload');
        }
        this.logger.info({ shopId, orderId: ttsOrderId, packageId, invoiceNumber: invoice?.number }, 'Uploading invoice to TikTok');
        await this.tiktokClient.uploadInvoice(shopId, {
            invoices: [
                {
                    package_id: packageId,
                    order_ids: ttsOrderId,
                    file_type: 'XML',
                    file: fileBase64,
                },
            ],
        });
        this.logger.info({ shopId, orderId: ttsOrderId, packageId }, 'Invoice uploaded to TikTok successfully');
    }
    async resolveInvoiceFileBase64(orderData, shopId) {
        const candidate = this.resolveInvoiceFileCandidate(orderData);
        if (!candidate) {
            return null;
        }
        if (candidate.kind === 'url') {
            const xmlContent = await this.vtexClient.fetchInvoiceFile(shopId, candidate.value);
            if (!xmlContent) {
                return null;
            }
            return this.normalizeInvoiceContentToBase64(xmlContent);
        }
        return this.normalizeInvoiceContentToBase64(candidate.value);
    }
    resolveInvoiceFileCandidate(orderData) {
        if (!orderData || typeof orderData !== 'object') {
            return null;
        }
        const candidates = [];
        if (Array.isArray(orderData?.invoiceData?.invoices)) {
            candidates.push(...orderData.invoiceData.invoices);
        }
        if (orderData?.invoiceData && typeof orderData.invoiceData === 'object') {
            candidates.push(orderData.invoiceData);
        }
        if (Array.isArray(orderData?.packageAttachment?.packages)) {
            candidates.push(...orderData.packageAttachment.packages);
        }
        if (orderData?.packageAttachment && typeof orderData.packageAttachment === 'object') {
            candidates.push(orderData.packageAttachment);
        }
        if (Array.isArray(orderData?.invoices)) {
            candidates.push(...orderData.invoices);
        }
        const contentKeys = [
            'invoiceXml',
            'invoice_xml',
            'nfeXml',
            'nfe_xml',
            'xml',
            'nf_xml',
            'embeddedInvoice',
            'embedded_invoice',
            'file',
            'content',
        ];
        const urlKeys = [
            'invoiceUrl',
            'invoice_url',
            'xmlUrl',
            'xml_url',
            'nfeUrl',
            'nfe_url',
            'embeddedInvoiceUrl',
            'embedded_invoice_url',
            'fileUrl',
            'file_url',
            'url',
        ];
        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object')
                continue;
            for (const key of contentKeys) {
                const value = candidate[key];
                if (typeof value === 'string' && value.trim()) {
                    return { kind: 'content', value: value.trim() };
                }
            }
            for (const key of urlKeys) {
                const value = candidate[key];
                if (typeof value === 'string' && value.trim()) {
                    return { kind: 'url', value: value.trim() };
                }
            }
        }
        return null;
    }
    normalizeInvoiceContentToBase64(content) {
        if (!content || typeof content !== 'string') {
            return null;
        }
        const trimmed = content.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.startsWith('<') || trimmed.startsWith('<?xml')) {
            return Buffer.from(trimmed, 'utf8').toString('base64');
        }
        if (this.isLikelyBase64(trimmed)) {
            return trimmed;
        }
        return null;
    }
    isLikelyBase64(value) {
        if (!value || value.length % 4 !== 0) {
            return false;
        }
        return /^[A-Za-z0-9+/=\r\n]+$/.test(value);
    }
    async resolveTiktokPackageId(shopId, ttsOrderId) {
        const response = await this.tiktokClient.getOrder(shopId, ttsOrderId);
        const orderData = response.data?.data?.orders?.[0] ??
            response.data?.data ??
            response.data;
        return this.extractPackageIdFromOrder(orderData, ttsOrderId);
    }
    extractPackageIdFromOrder(orderData, ttsOrderId) {
        if (!orderData || typeof orderData !== 'object') {
            return null;
        }
        const packages = orderData?.packages ??
            orderData?.package_list ??
            orderData?.packageList ??
            orderData?.package ??
            orderData?.package_info ??
            orderData?.packageInfo ??
            orderData?.packageAttachment?.packages ??
            null;
        if (Array.isArray(packages)) {
            const match = packages.find((pkg) => {
                const orderIds = pkg?.order_ids ?? pkg?.orderIds ?? pkg?.order_id ?? pkg?.orderId;
                if (Array.isArray(orderIds)) {
                    return orderIds.includes(ttsOrderId);
                }
                return orderIds === ttsOrderId;
            });
            const candidate = match ?? packages[0];
            const packageId = candidate?.package_id ??
                candidate?.packageId ??
                candidate?.id ??
                null;
            if (packageId) {
                return String(packageId);
            }
        }
        const direct = orderData?.package_id ?? orderData?.packageId;
        if (direct) {
            return String(direct);
        }
        return this.findFirstKeyValue(orderData, ['package_id', 'packageId']);
    }
    findFirstKeyValue(input, keys) {
        if (!input || typeof input !== 'object') {
            return null;
        }
        if (Array.isArray(input)) {
            for (const item of input) {
                const found = this.findFirstKeyValue(item, keys);
                if (found)
                    return found;
            }
            return null;
        }
        for (const key of keys) {
            if (input[key]) {
                return String(input[key]);
            }
        }
        for (const value of Object.values(input)) {
            const found = this.findFirstKeyValue(value, keys);
            if (found)
                return found;
        }
        return null;
    }
    resolveOrderValue(order) {
        const candidates = [
            order?.value,
            order?.totalValue,
            order?.invoiceData?.totalValue,
            order?.invoiceData?.invoiceValue,
        ];
        for (const candidate of candidates) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric;
            }
        }
        return 0;
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tiktok_order_client_1.TiktokOrderClient,
        vtex_orders_client_1.VtexOrdersClient,
        idempotency_service_1.IdempotencyService,
        prisma_service_1.PrismaService,
        config_1.ConfigService,
        shop_config_service_1.ShopConfigService,
        logistics_service_1.LogisticsService,
        nestjs_pino_1.PinoLogger])
], OrdersService);
//# sourceMappingURL=orders.service.js.map