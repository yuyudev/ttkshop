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
const prisma_service_1 = require("../prisma/prisma.service");
const vtex_catalog_client_1 = require("./vtex-catalog.client");
const tiktok_product_client_1 = require("./tiktok-product.client");
let CatalogService = CatalogService_1 = class CatalogService {
    constructor(vtexClient, tiktokClient, prisma, logger) {
        this.vtexClient = vtexClient;
        this.tiktokClient = tiktokClient;
        this.prisma = prisma;
        this.logger = logger;
        this.logger.setContext(CatalogService_1.name);
    }
    async syncCatalog(shopId, input) {
        const skuSummaries = await this.vtexClient.listSkus(input.updatedFrom);
        let processed = 0;
        let synced = 0;
        const errors = {};
        for (const summary of skuSummaries) {
            processed += 1;
            try {
                const sku = await this.vtexClient.getSkuById(summary.id);
                const productId = sku?.ProductId ?? sku?.productId ?? sku?.ParentProductId;
                if (!productId) {
                    throw new Error('VTEX SKU did not include productId');
                }
                const product = await this.vtexClient.getProductById(String(productId));
                const price = await this.vtexClient.getPrice(summary.id);
                const images = await this.fetchImagesSafely(summary.id);
                const quantity = sku.StockBalance ?? sku.stockBalance ?? 0;
                const productInput = {
                    vtexSkuId: summary.id,
                    sku,
                    product,
                    price,
                    quantity,
                    images,
                };
                const mapping = await this.prisma.productMap.findUnique({
                    where: { vtexSkuId: summary.id },
                });
                let ttsSkuId = mapping?.ttsSkuId ?? null;
                let ttsProductId = mapping?.ttsProductId ?? null;
                if (!mapping?.ttsProductId) {
                    const response = await this.tiktokClient.createProduct(shopId, productInput);
                    ({ productId: ttsProductId, skuId: ttsSkuId } = this.extractIdentifiers(response));
                    await this.prisma.productMap.upsert({
                        where: { vtexSkuId: summary.id },
                        update: {
                            status: 'synced',
                            lastError: null,
                            ttsProductId,
                            ttsSkuId,
                            shopId,
                        },
                        create: {
                            vtexSkuId: summary.id,
                            shopId,
                            status: 'synced',
                            ttsProductId,
                            ttsSkuId,
                        },
                    });
                }
                else {
                    const response = await this.tiktokClient.updateProduct(shopId, mapping.ttsProductId, productInput);
                    const identifiers = this.extractIdentifiers(response);
                    ttsProductId = identifiers.productId ?? mapping.ttsProductId;
                    ttsSkuId = identifiers.skuId ?? mapping.ttsSkuId;
                    await this.prisma.productMap.update({
                        where: { vtexSkuId: summary.id },
                        data: {
                            status: 'synced',
                            lastError: null,
                            shopId,
                            ttsProductId,
                            ttsSkuId,
                        },
                    });
                }
                synced += 1;
            }
            catch (error) {
                const errorPayload = (0, axios_1.isAxiosError)(error) ? error.response?.data : undefined;
                const message = errorPayload !== undefined
                    ? JSON.stringify(errorPayload)
                    : error instanceof Error
                        ? error.message
                        : 'Unknown error';
                this.logger.error({ err: error, skuId: summary.id, errorPayload }, 'Failed to sync SKU');
                await this.prisma.productMap.upsert({
                    where: { vtexSkuId: summary.id },
                    update: {
                        status: 'error',
                        lastError: message,
                        shopId,
                    },
                    create: {
                        vtexSkuId: summary.id,
                        shopId,
                        status: 'error',
                        lastError: message,
                    },
                });
                errors[summary.id] = message;
            }
        }
        return {
            processed,
            synced,
            failed: processed - synced,
            errors,
        };
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
    extractIdentifiers(response) {
        const rawData = response.raw;
        const productId = response.productId ??
            rawData?.data?.product_id ??
            rawData?.data?.product?.product_id ??
            rawData?.product_id ??
            null;
        const skuId = response.skuId ??
            rawData?.data?.skus?.[0]?.id ??
            rawData?.data?.sku_id ??
            rawData?.skus?.[0]?.id ??
            null;
        return { productId, skuId };
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = CatalogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [vtex_catalog_client_1.VtexCatalogClient,
        tiktok_product_client_1.TiktokProductClient,
        prisma_service_1.PrismaService,
        nestjs_pino_1.PinoLogger])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map