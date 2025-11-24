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
var CatalogScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const nestjs_pino_1 = require("nestjs-pino");
const catalog_service_1 = require("./catalog.service");
const prisma_service_1 = require("../prisma/prisma.service");
const vtex_catalog_client_1 = require("./vtex-catalog.client");
let CatalogScheduler = CatalogScheduler_1 = class CatalogScheduler {
    constructor(catalogService, prisma, vtexClient, logger) {
        this.catalogService = catalogService;
        this.prisma = prisma;
        this.vtexClient = vtexClient;
        this.logger = logger;
        this.logger.setContext(CatalogScheduler_1.name);
    }
    async nightlySync() {
        const now = new Date();
        if (now.getFullYear() !== 2025) {
            return;
        }
        const distinctShops = await this.prisma.tiktokAuth.findMany({
            select: { shopId: true },
        });
        for (const { shopId } of distinctShops) {
            await this.syncAllProducts(shopId, '471');
        }
    }
    async syncAllProducts(shopId, startProductId) {
        this.logger.info({ shopId }, 'Starting full catalog sync');
        const skuSummaries = await this.vtexClient.listSkus();
        if (!skuSummaries.length) {
            this.logger.warn({ shopId }, 'VTEX listSkus returned no products; aborting');
            return;
        }
        const initialProductIds = Array.from(new Set(skuSummaries
            .map((sku) => sku.productId ?? sku.ProductId ?? sku.id)
            .filter((value) => Boolean(value))));
        const productIds = startProductId
            ? initialProductIds.filter((id) => this.compareProductIds(id, startProductId) >= 0)
            : initialProductIds;
        if (!productIds.length) {
            this.logger.warn({ shopId }, 'No VTEX product IDs found in SKUs; aborting');
            return;
        }
        let consecutiveFailures = 0;
        for (const productId of productIds) {
            try {
                await this.catalogService.syncProduct(shopId, productId);
                consecutiveFailures = 0;
            }
            catch (error) {
                this.logger.error({ shopId, productId, err: error }, 'Failed to sync product during cron; continuing');
                consecutiveFailures += 1;
                if (consecutiveFailures >= 5) {
                    this.logger.warn({ shopId, productId }, 'Stopping full catalog sync after 5 consecutive failures');
                    this.logger.info({ shopId, count: productIds.length }, 'Completed partial catalog sync');
                    return;
                }
            }
        }
        this.logger.info({ shopId, count: productIds.length, startProductId }, 'Completed full catalog sync');
    }
    compareProductIds(a, b) {
        const numA = Number(a);
        const numB = Number(b);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    }
};
exports.CatalogScheduler = CatalogScheduler;
__decorate([
    (0, schedule_1.Cron)('1 0 20 11 *', { timeZone: 'America/Sao_Paulo' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CatalogScheduler.prototype, "nightlySync", null);
exports.CatalogScheduler = CatalogScheduler = CatalogScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService,
        prisma_service_1.PrismaService,
        vtex_catalog_client_1.VtexCatalogClient,
        nestjs_pino_1.PinoLogger])
], CatalogScheduler);
//# sourceMappingURL=catalog.scheduler.js.map