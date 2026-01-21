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
var InventoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
const vtex_catalog_client_1 = require("../catalog/vtex-catalog.client");
const tiktok_product_client_1 = require("../catalog/tiktok-product.client");
const catalog_service_1 = require("../catalog/catalog.service");
let InventoryService = InventoryService_1 = class InventoryService {
    constructor(prisma, vtexClient, tiktokClient, catalogService, configService, logger) {
        this.prisma = prisma;
        this.vtexClient = vtexClient;
        this.tiktokClient = tiktokClient;
        this.catalogService = catalogService;
        this.configService = configService;
        this.logger = logger;
        this.logger.setContext(InventoryService_1.name);
    }
    async syncInventory(shopId, payload) {
        const mappings = (await this.prisma.productMap.findMany({
            where: {
                status: 'synced',
                ttsSkuId: { not: null },
                shopId,
            },
        }));
        const skuIds = payload.skuIds?.length
            ? payload.skuIds
            : mappings.map((item) => item.vtexSkuId);
        const warehouseId = payload.warehouseId ??
            this.configService.get('VTEX_WAREHOUSE_ID', { infer: true }) ??
            '1_1';
        const results = [];
        for (const skuId of skuIds) {
            try {
                const inventory = await this.vtexClient.getSkuInventory(skuId, warehouseId);
                const mapping = mappings.find((item) => item.vtexSkuId === skuId);
                if (!mapping?.ttsSkuId || !mapping.ttsProductId) {
                    continue;
                }
                await this.tiktokClient.updateStock(shopId, warehouseId, mapping.ttsSkuId, inventory, mapping.ttsProductId);
                results.push({ skuId, inventory, status: 'synced' });
            }
            catch (error) {
                this.logger.error({ err: error, skuId }, 'Failed to sync inventory for SKU');
                results.push({
                    skuId,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        return {
            shopId,
            warehouseId,
            count: results.length,
            results,
        };
    }
    async handleVtexWebhook(payload) {
        this.logger.info({ payload }, 'VTEX inventory webhook payload received');
        const items = Array.isArray(payload) ? payload : [payload];
        const skuIds = items
            .map((item) => item?.IdSku || item?.idSku || item?.skuId)
            .filter((id) => !!id);
        if (!skuIds.length) {
            this.logger.warn({ payload }, 'Received VTEX inventory webhook with no valid SKUs');
            return { status: 'ignored', reason: 'no_skus_found' };
        }
        this.logger.info({ skuCount: skuIds.length, skuIds }, 'Processing VTEX inventory webhook');
        const mappings = await this.prisma.productMap.findMany({
            where: {
                vtexSkuId: { in: skuIds },
                status: 'synced',
                ttsSkuId: { not: null },
            },
        });
        if (!mappings.length) {
            this.logger.warn({ skuIds, skuCount: skuIds.length }, 'VTEX inventory webhook SKUs not mapped');
            return { status: 'ignored', reason: 'skus_not_mapped' };
        }
        const shops = [...new Set(mappings.map((m) => m.shopId))];
        this.logger.info({ shopCount: shops.length, shops, mappedSkus: mappings.length }, 'Resolved shops for VTEX inventory webhook');
        const results = [];
        for (const shopId of shops) {
            const shopSkuIds = mappings
                .filter((m) => m.shopId === shopId)
                .map((m) => m.vtexSkuId);
            this.logger.info({ shopId, skuCount: shopSkuIds.length, skuIds: shopSkuIds }, 'Syncing inventory for VTEX webhook shop');
            const result = await this.syncInventory(shopId, { skuIds: shopSkuIds });
            results.push(result);
        }
        return { status: 'processed', results };
    }
    scheduleVtexInventory(payload) {
        setImmediate(() => {
            this.handleVtexWebhook(payload).catch((error) => {
                this.logger.error({ err: error }, 'Failed to process VTEX inventory webhook');
            });
        });
    }
    scheduleVtexNotification(payload) {
        setImmediate(() => {
            this.handleVtexNotification(payload).catch((error) => {
                this.logger.error({ err: error }, 'Failed to process VTEX notification');
            });
        });
    }
    async handleVtexNotification(payload) {
        this.logger.info({ payload }, 'VTEX broadcaster notification payload received');
        const items = Array.isArray(payload) ? payload : [payload];
        this.logger.info({ itemCount: items.length, items }, 'VTEX broadcaster items received');
        const events = items
            .map((item) => this.normalizeAffiliateNotification(item))
            .filter((event) => event.skuId);
        if (!events.length) {
            this.logger.warn({ payload }, 'Received VTEX notification with no valid SKUs');
            return { status: 'ignored', reason: 'no_skus_found' };
        }
        this.logger.info({ events }, 'VTEX broadcaster events normalized');
        const stockSkuIds = new Set();
        const updateSkuIds = new Set();
        const productIdBySku = new Map();
        let fallbackStockCount = 0;
        for (const event of events) {
            const hasExplicitFlags = event.stockModified || event.priceModified || event.skuModified;
            if (!hasExplicitFlags && !event.removedFromAffiliate) {
                event.stockModified = true;
                fallbackStockCount += 1;
            }
            if (event.productId) {
                productIdBySku.set(event.skuId, event.productId);
            }
            if (event.stockModified) {
                stockSkuIds.add(event.skuId);
            }
            if (event.priceModified || event.skuModified) {
                updateSkuIds.add(event.skuId);
            }
            if (event.isActive === false || event.removedFromAffiliate) {
                this.logger.warn({ skuId: event.skuId, productId: event.productId }, 'VTEX notification indicates inactive or removed SKU');
            }
        }
        if (fallbackStockCount > 0) {
            this.logger.info({ fallbackStockCount, totalEvents: events.length }, 'VTEX notification missing flags; defaulting to stock sync');
        }
        const relevantSkuIds = Array.from(new Set([...stockSkuIds, ...updateSkuIds]));
        if (!relevantSkuIds.length) {
            this.logger.warn({ events }, 'VTEX notification did not include stock/price/sku flags');
            return { status: 'ignored', reason: 'no_relevant_flags' };
        }
        this.logger.info({
            stockSkuIds: Array.from(stockSkuIds),
            updateSkuIds: Array.from(updateSkuIds),
        }, 'VTEX broadcaster SKU flags resolved');
        const mappings = (await this.prisma.productMap.findMany({
            where: {
                vtexSkuId: { in: relevantSkuIds },
                status: 'synced',
                ttsSkuId: { not: null },
                ttsProductId: { not: null },
            },
        }));
        if (!mappings.length) {
            this.logger.warn({ relevantSkuIds, skuCount: relevantSkuIds.length }, 'VTEX notification SKUs not mapped');
            return { status: 'ignored', reason: 'skus_not_mapped' };
        }
        const shopIds = Array.from(new Set(mappings.map((mapping) => mapping.shopId)));
        this.logger.info({ shopCount: shopIds.length, shopIds, mappedSkus: mappings.length }, 'Resolved shops for VTEX notification');
        const results = [];
        const warehouseId = this.configService.get('VTEX_WAREHOUSE_ID', { infer: true }) ??
            '1_1';
        for (const shopId of shopIds) {
            const shopMappings = mappings.filter((mapping) => mapping.shopId === shopId);
            const shopSkuIds = new Set(shopMappings.map((mapping) => mapping.vtexSkuId));
            const shopUpdateSkuIds = Array.from(updateSkuIds).filter((skuId) => shopSkuIds.has(skuId));
            const shopStockSkuIds = Array.from(stockSkuIds).filter((skuId) => shopSkuIds.has(skuId) && !updateSkuIds.has(skuId));
            this.logger.info({
                shopId,
                stockSkuIds: shopStockSkuIds,
                updateSkuIds: shopUpdateSkuIds,
                warehouseId,
            }, 'Prepared VTEX notification sync for shop');
            if (shopStockSkuIds.length) {
                const result = await this.syncInventory(shopId, {
                    skuIds: shopStockSkuIds,
                    warehouseId,
                });
                results.push({
                    shopId,
                    type: 'stock',
                    skuCount: shopStockSkuIds.length,
                    result,
                });
            }
            if (shopUpdateSkuIds.length) {
                const productIds = new Set();
                const fallbackSkuIds = [];
                for (const skuId of shopUpdateSkuIds) {
                    const productId = productIdBySku.get(skuId);
                    if (productId) {
                        productIds.add(productId);
                    }
                    else {
                        fallbackSkuIds.push(skuId);
                    }
                }
                const updateResults = [];
                this.logger.info({
                    shopId,
                    productIds: Array.from(productIds),
                    fallbackSkuIds,
                }, 'VTEX notification product update targets resolved');
                for (const productId of productIds) {
                    try {
                        await this.catalogService.syncProduct(shopId, productId, {
                            allowZeroStock: true,
                        });
                        updateResults.push({ productId, status: 'synced' });
                    }
                    catch (error) {
                        this.logger.error({ err: error, shopId, productId }, 'Failed to sync product after VTEX notification');
                        updateResults.push({
                            productId,
                            status: 'error',
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                }
                for (const skuId of fallbackSkuIds) {
                    try {
                        await this.catalogService.syncProductBySkuId(shopId, skuId, {
                            allowZeroStock: true,
                        });
                        updateResults.push({ skuId, status: 'synced' });
                    }
                    catch (error) {
                        this.logger.error({ err: error, shopId, skuId }, 'Failed to sync SKU after VTEX notification');
                        updateResults.push({
                            skuId,
                            status: 'error',
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                }
                results.push({
                    shopId,
                    type: 'product',
                    skuCount: shopUpdateSkuIds.length,
                    updates: updateResults,
                });
            }
        }
        return { status: 'processed', results };
    }
    normalizeAffiliateNotification(item) {
        const skuId = this.extractSkuId(item);
        const productId = this.extractProductId(item);
        const stockModified = this.toBoolean(item?.StockModified ?? item?.stockModified ?? item?.StockChanged);
        const priceModified = this.toBoolean(item?.PriceModified ?? item?.priceModified ?? item?.PriceChanged);
        const skuModified = this.toBoolean(item?.HasStockKeepingUnitModified ??
            item?.hasStockKeepingUnitModified ??
            item?.SkuModified);
        const isActive = item?.IsActive ?? item?.isActive;
        const removedFromAffiliate = item?.HasStockKeepingUnitRemovedFromAffiliate ??
            item?.HasStockKeepingUnitRemovedFromAffiliateId ??
            item?.hasStockKeepingUnitRemovedFromAffiliate ??
            false;
        return {
            skuId,
            productId,
            stockModified,
            priceModified,
            skuModified,
            isActive: isActive === undefined || isActive === null ? undefined : this.toBoolean(isActive),
            removedFromAffiliate: this.toBoolean(removedFromAffiliate),
        };
    }
    extractSkuId(item) {
        const candidate = item?.IdSku ??
            item?.idSku ??
            item?.skuId ??
            item?.SkuId ??
            item?.SKUId ??
            null;
        return candidate ? String(candidate) : '';
    }
    extractProductId(item) {
        const candidate = item?.ProductId ??
            item?.productId ??
            item?.IdProduct ??
            item?.idProduct ??
            null;
        return candidate ? String(candidate) : null;
    }
    toBoolean(value) {
        if (value === true || value === 1 || value === '1') {
            return true;
        }
        if (typeof value === 'string') {
            return value.trim().toLowerCase() === 'true';
        }
        return false;
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = InventoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        vtex_catalog_client_1.VtexCatalogClient,
        tiktok_product_client_1.TiktokProductClient,
        catalog_service_1.CatalogService,
        config_1.ConfigService,
        nestjs_pino_1.PinoLogger])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map