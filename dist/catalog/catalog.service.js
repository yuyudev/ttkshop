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
var CatalogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const nestjs_pino_1 = require("nestjs-pino");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const vtex_catalog_client_1 = require("./vtex-catalog.client");
const tiktok_product_client_1 = require("./tiktok-product.client");
let CatalogService = CatalogService_1 = class CatalogService {
    constructor(vtexClient, tiktokClient, prisma, logger, configService) {
        this.vtexClient = vtexClient;
        this.tiktokClient = tiktokClient;
        this.prisma = prisma;
        this.logger = logger;
        this.configService = configService;
        this.MAX_SKUS_PER_RUN = 50;
        this.productSkuCache = new Map();
        this.logger.setContext(CatalogService_1.name);
    }
    async syncCatalog(shopId, input) {
        const skuSummaries = await this.vtexClient.listSkus(input.updatedFrom);
        const processedSkuIds = new Set();
        const productGroups = new Map();
        let groupedSkuCount = 0;
        for (const { id } of skuSummaries) {
            if (groupedSkuCount >= this.MAX_SKUS_PER_RUN) {
                break;
            }
            const skuId = String(id);
            if (!skuId)
                continue;
            const sku = await this.vtexClient.getSkuById(skuId);
            const productId = this.extractProductId(sku);
            if (!productId)
                continue;
            if (!productGroups.has(productId)) {
                productGroups.set(productId, []);
            }
            productGroups.get(productId).push(skuId);
            groupedSkuCount += 1;
        }
        let processed = 0;
        let synced = 0;
        const errors = {};
        for (const [, skuIds] of productGroups) {
            if (processed >= this.MAX_SKUS_PER_RUN)
                break;
            const remainingBudget = this.MAX_SKUS_PER_RUN - processed;
            const result = await this.syncProductBySku(shopId, skuIds[0], processedSkuIds, remainingBudget, processed === 0);
            if (result.budgetExceeded)
                break;
            processed += result.processedSkus;
            synced += result.syncedSkus;
            Object.assign(errors, result.errors);
        }
        const remaining = Math.max(skuSummaries.length - processedSkuIds.size, 0);
        return { processed, synced, failed: processed - synced, remaining, errors };
    }
    async syncProductBySku(shopId, vtexSkuId, processedSkuIds, remainingBudget, allowBudgetOverflow) {
        const errors = {};
        let relatedSkuIds = [];
        let productId = null;
        try {
            const sku = await this.vtexClient.getSkuById(vtexSkuId);
            productId = this.extractProductId(sku);
            if (!productId) {
                throw new Error('VTEX SKU did not include productId');
            }
            const product = await this.vtexClient.getProductById(productId);
            relatedSkuIds = await this.getSkuIdsForProduct(productId, vtexSkuId);
            if (!allowBudgetOverflow &&
                remainingBudget >= 0 &&
                relatedSkuIds.length > remainingBudget) {
                return {
                    processedSkus: 0,
                    syncedSkus: 0,
                    errors,
                    budgetExceeded: true,
                };
            }
            const mappings = await this.prisma.productMap.findMany({
                where: {
                    shopId,
                    vtexSkuId: { in: relatedSkuIds },
                },
            });
            const distinctProductIds = Array.from(new Set(mappings
                .map((m) => m.ttsProductId)
                .filter((value) => Boolean(value))));
            let existingProductId = null;
            let effectiveMappings = mappings;
            if (distinctProductIds.length === 1) {
                existingProductId = distinctProductIds[0];
                effectiveMappings = mappings.filter((m) => m.ttsProductId === existingProductId);
            }
            else if (distinctProductIds.length > 1) {
                this.logger.warn({
                    vtexProductId: product.Id,
                    relatedSkuIds,
                    ttsProductIds: distinctProductIds,
                }, 'Multiple TikTok product IDs found for VTEX product; resetting mappings and recreating product on TikTok');
                await this.prisma.productMap.updateMany({
                    where: {
                        shopId,
                        vtexSkuId: { in: relatedSkuIds },
                    },
                    data: {
                        status: 'pending',
                        lastError: null,
                        ttsProductId: null,
                        ttsSkuId: null,
                    },
                });
                existingProductId = null;
                effectiveMappings = [];
            }
            else {
                existingProductId = null;
                effectiveMappings = [];
            }
            const mappingBySkuId = new Map(effectiveMappings.map((mapping) => [mapping.vtexSkuId, mapping]));
            const skuInputs = [];
            for (const skuId of relatedSkuIds) {
                const skuDetails = skuId === vtexSkuId ? sku : await this.vtexClient.getSkuById(skuId);
                const price = await this.vtexClient.getPrice(skuId);
                const images = await this.fetchImagesSafely(skuId);
                const warehouseId = this.configService.get('VTEX_WAREHOUSE_ID', { infer: true }) ?? '1_1';
                const quantity = await this.vtexClient.getSkuInventory(skuId, warehouseId);
                const mapping = mappingBySkuId.get(skuId);
                skuInputs.push({
                    vtexSkuId: skuId,
                    sku: skuDetails,
                    price,
                    quantity,
                    images,
                    sizeLabel: this.deriveSizeLabel(product, skuDetails),
                    ttsSkuId: mapping?.ttsSkuId ?? null,
                });
            }
            const seenSizes = new Set();
            for (const skuInput of skuInputs) {
                if (!skuInput.sizeLabel)
                    continue;
                const normalized = skuInput.sizeLabel.toString().trim().toUpperCase();
                if (!normalized) {
                    skuInput.sizeLabel = undefined;
                    continue;
                }
                if (seenSizes.has(normalized)) {
                    this.logger.warn({
                        productId,
                        vtexSkuId: skuInput.vtexSkuId,
                        sizeLabelOriginal: skuInput.sizeLabel,
                        sizeLabelNormalized: normalized,
                    }, 'Duplicate size label for product; clearing sales attribute to avoid TikTok error 12052251');
                    skuInput.sizeLabel = undefined;
                }
                else {
                    skuInput.sizeLabel = normalized;
                    seenSizes.add(normalized);
                }
            }
            const productInput = {
                product,
                skus: skuInputs,
            };
            const response = existingProductId
                ? await this.tiktokClient.updateProduct(shopId, existingProductId, productInput)
                : await this.tiktokClient.createProduct(shopId, productInput);
            const targetProductId = response.productId ?? existingProductId ?? null;
            let syncedSkus = 0;
            for (const skuInput of skuInputs) {
                const mappedSkuId = response.skuIds[String(skuInput.vtexSkuId)] ??
                    skuInput.ttsSkuId ??
                    null;
                await this.prisma.productMap.upsert({
                    where: { vtexSkuId: skuInput.vtexSkuId },
                    update: {
                        status: 'synced',
                        lastError: null,
                        shopId,
                        ttsProductId: targetProductId,
                        ttsSkuId: mappedSkuId,
                    },
                    create: {
                        vtexSkuId: skuInput.vtexSkuId,
                        shopId,
                        status: 'synced',
                        ttsProductId: targetProductId,
                        ttsSkuId: mappedSkuId,
                    },
                });
                processedSkuIds.add(skuInput.vtexSkuId);
                syncedSkus += 1;
                this.logger.info({
                    skuId: skuInput.vtexSkuId,
                    ttsProductId: targetProductId,
                    ttsSkuId: mappedSkuId,
                }, existingProductId
                    ? 'Successfully synced SKU to TikTok (update)'
                    : 'Successfully synced SKU to TikTok (create)');
            }
            return {
                processedSkus: skuInputs.length,
                syncedSkus,
                errors,
            };
        }
        catch (error) {
            const errorPayload = (0, axios_1.isAxiosError)(error) ? error.response?.data : undefined;
            const message = errorPayload !== undefined
                ? JSON.stringify(errorPayload)
                : error instanceof Error
                    ? error.message
                    : 'Unknown error';
            this.logger.error({
                err: error,
                skuId: vtexSkuId,
                relatedSkuIds,
                productId,
                errorPayload,
            }, 'Failed to sync VTEX product to TikTok');
            const affectedSkuIds = relatedSkuIds.length ? relatedSkuIds : [vtexSkuId];
            for (const skuId of affectedSkuIds) {
                processedSkuIds.add(skuId);
                await this.prisma.productMap.upsert({
                    where: { vtexSkuId: skuId },
                    update: {
                        status: 'error',
                        lastError: message,
                        shopId,
                    },
                    create: {
                        vtexSkuId: skuId,
                        shopId,
                        status: 'error',
                        lastError: message,
                    },
                });
                errors[skuId] = message;
            }
            return {
                processedSkus: affectedSkuIds.length,
                syncedSkus: 0,
                errors,
            };
        }
    }
    async syncProduct(shopId, productId) {
        const skuIds = await this.getSkuIdsForProduct(productId, productId);
        const result = await this.syncProductBySku(shopId, skuIds[0], new Set(), this.MAX_SKUS_PER_RUN, true);
        return result;
    }
    extractProductId(sku) {
        const productId = sku?.ProductId ??
            sku?.productId ??
            sku?.ParentProductId ??
            null;
        return productId ? String(productId) : null;
    }
    async getSkuIdsForProduct(productId, fallbackSkuId) {
        const cached = this.productSkuCache.get(productId);
        if (cached && cached.length) {
            if (!cached.includes(fallbackSkuId)) {
                const updated = Array.from(new Set([...cached, fallbackSkuId].map(String)));
                this.productSkuCache.set(productId, updated);
                return updated;
            }
            return cached;
        }
        let relatedSkuIds = [];
        try {
            const productSkusPayload = await this.vtexClient.getProductWithSkus(productId);
            relatedSkuIds = this.normalizeProductSkuIds(productSkusPayload);
        }
        catch (error) {
            if (this.isNotFoundError(error)) {
                this.logger.warn({ productId }, 'VTEX product returned 404 for product SKUs endpoint; attempting search fallback');
                relatedSkuIds = [];
            }
            else {
                throw error;
            }
        }
        if (!relatedSkuIds.length) {
            try {
                const searchPayload = await this.vtexClient.searchProductWithItems(productId);
                relatedSkuIds = this.extractSkuIdsFromSearchPayload(searchPayload);
            }
            catch (error) {
                if (this.isNotFoundError(error)) {
                    this.logger.warn({ productId }, 'VTEX product search returned 404; using fallback SKU only');
                }
                else {
                    this.logger.error({ productId, err: error }, 'Failed to retrieve VTEX product SKUs via search fallback');
                }
                relatedSkuIds = [];
            }
        }
        if (!relatedSkuIds.includes(fallbackSkuId)) {
            relatedSkuIds.push(fallbackSkuId);
        }
        const normalized = Array.from(new Set(relatedSkuIds.map(String)));
        this.productSkuCache.set(productId, normalized);
        return normalized;
    }
    normalizeProductSkuIds(raw) {
        const candidates = [];
        const register = (value) => {
            if (value === undefined || value === null) {
                return;
            }
            const id = String(value);
            if (id) {
                candidates.push(id);
            }
        };
        const handleItem = (item) => {
            if (!item) {
                return;
            }
            register(item.Id ?? item.id ?? item.SkuId ?? item.skuId ?? item.skuID ?? item);
        };
        if (Array.isArray(raw)) {
            raw.forEach(handleItem);
        }
        else if (raw && typeof raw === 'object') {
            const obj = raw;
            if (Array.isArray(obj.items)) {
                obj.items.forEach(handleItem);
            }
            if (Array.isArray(obj.skus)) {
                obj.skus.forEach(handleItem);
            }
            if (Array.isArray(obj.data)) {
                obj.data.forEach(handleItem);
            }
        }
        return Array.from(new Set(candidates));
    }
    extractSkuIdsFromSearchPayload(raw) {
        if (!raw) {
            return [];
        }
        const results = Array.isArray(raw) ? raw : [raw];
        const skuIds = [];
        for (const product of results) {
            if (!product || typeof product !== 'object') {
                continue;
            }
            const items = Array.isArray(product.items) ? product.items : [];
            for (const item of items) {
                if (!item || typeof item !== 'object') {
                    continue;
                }
                const itemId = item.itemId ??
                    item.id ??
                    item.skuId ??
                    item.ItemId ??
                    item.SkuId ??
                    item.SkuID ??
                    null;
                if (itemId) {
                    skuIds.push(String(itemId));
                }
            }
        }
        return Array.from(new Set(skuIds));
    }
    deriveSizeLabel(product, sku) {
        const productName = (product.Name ?? '').toString().trim().toLowerCase();
        const rawSkuName = (sku.Name ?? sku.name ?? sku.NameComplete ?? '')
            .toString().trim();
        let suffix = '';
        if (productName && rawSkuName.toLowerCase().startsWith(productName)) {
            suffix = rawSkuName.slice(productName.length).trim();
        }
        else {
            const parts = rawSkuName.split(/\s+/);
            suffix = parts[parts.length - 1] ?? '';
        }
        const match = suffix.match(/^(pp|p|m|g|gg|\d{1,3})$/i);
        if (match) {
            return match[1].toUpperCase();
        }
        const refId = sku.RefId ?? sku.refId;
        if (typeof refId === 'string') {
            const refParts = refId.split(/[_-]/).map((p) => p.trim()).filter(Boolean);
            const last = refParts[refParts.length - 1];
            if (last && /^[0-9]{1,3}$/i.test(last)) {
                return last;
            }
        }
        return undefined;
    }
    async fetchImagesSafely(skuId) {
        try {
            return await this.vtexClient.getSkuImages(String(skuId));
        }
        catch (error) {
            if (this.isNotFoundError(error)) {
                this.logger.warn({ skuId }, 'VTEX product returned 404 for images endpoint; proceeding without images');
                return [];
            }
            throw error;
        }
    }
    isNotFoundError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            error.response?.status === 404);
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = CatalogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [vtex_catalog_client_1.VtexCatalogClient,
        tiktok_product_client_1.TiktokProductClient,
        prisma_service_1.PrismaService,
        nestjs_pino_1.PinoLogger,
        config_1.ConfigService])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map