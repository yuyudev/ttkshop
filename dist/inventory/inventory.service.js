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
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
const vtex_catalog_client_1 = require("../catalog/vtex-catalog.client");
const tiktok_product_client_1 = require("../catalog/tiktok-product.client");
let InventoryService = InventoryService_1 = class InventoryService {
    constructor(prisma, vtexClient, tiktokClient, logger) {
        this.prisma = prisma;
        this.vtexClient = vtexClient;
        this.tiktokClient = tiktokClient;
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
        const warehouseId = payload.warehouseId ?? 'DEFAULT';
        const results = [];
        for (const skuId of skuIds) {
            try {
                const sku = await this.vtexClient.getSkuById(skuId);
                const inventory = sku.StockBalance ?? sku.stockBalance ?? 0;
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
        const items = Array.isArray(payload) ? payload : [payload];
        const skuIds = items
            .map((item) => item?.IdSku || item?.idSku || item?.skuId)
            .filter((id) => !!id);
        if (!skuIds.length) {
            this.logger.warn({ payload }, 'Received VTEX inventory webhook with no valid SKUs');
            return { status: 'ignored', reason: 'no_skus_found' };
        }
        this.logger.info({ skuIds }, 'Processing VTEX inventory webhook');
        const mappings = await this.prisma.productMap.findMany({
            where: {
                vtexSkuId: { in: skuIds },
                status: 'synced',
                ttsSkuId: { not: null },
            },
        });
        if (!mappings.length) {
            return { status: 'ignored', reason: 'skus_not_mapped' };
        }
        const shops = [...new Set(mappings.map((m) => m.shopId))];
        const results = [];
        for (const shopId of shops) {
            const shopSkuIds = mappings
                .filter((m) => m.shopId === shopId)
                .map((m) => m.vtexSkuId);
            const result = await this.syncInventory(shopId, { skuIds: shopSkuIds });
            results.push(result);
        }
        return { status: 'processed', results };
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = InventoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        vtex_catalog_client_1.VtexCatalogClient,
        tiktok_product_client_1.TiktokProductClient,
        nestjs_pino_1.PinoLogger])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map