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
var ShopConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopConfigService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
let ShopConfigService = ShopConfigService_1 = class ShopConfigService {
    constructor(prisma, logger) {
        this.prisma = prisma;
        this.logger = logger;
        this.logger.setContext(ShopConfigService_1.name);
    }
    async getVtexConfig(shopId) {
        const record = await this.getShopRecord(shopId);
        return {
            account: this.requireValue(record, 'vtexAccount', 'VTEX_ACCOUNT', record.shopId),
            environment: this.requireValue(record, 'vtexEnvironment', 'VTEX_ENVIRONMENT', record.shopId),
            appKey: this.requireValue(record, 'vtexAppKey', 'VTEX_APP_KEY', record.shopId),
            appToken: this.requireValue(record, 'vtexAppToken', 'VTEX_APP_TOKEN', record.shopId),
            warehouseId: this.normalizeOptional(record.vtexWarehouseId) ?? '1_1',
            salesChannel: this.normalizeOptional(record.vtexSalesChannel) ?? '1',
            affiliateId: this.normalizeOptional(record.vtexAffiliateId),
            webhookToken: this.normalizeOptional(record.vtexWebhookToken),
            domain: this.normalizeOptional(record.vtexDomain),
            pricingDomain: this.normalizeOptional(record.vtexPricingDomain),
            marketplaceServicesEndpoint: this.normalizeOptional(record.vtexMarketplaceServicesEndpoint),
            paymentSystemId: this.normalizeOptional(record.vtexPaymentSystemId),
            paymentSystemName: this.normalizeOptional(record.vtexPaymentSystemName),
            paymentGroup: this.normalizeOptional(record.vtexPaymentGroup),
            paymentMerchant: this.normalizeOptional(record.vtexPaymentMerchant),
            preferredSlaId: this.normalizeOptional(record.vtexPreferredSlaId),
            sellerId: this.normalizeOptional(record.vtexSellerId),
        };
    }
    async getTiktokCatalogConfig(shopId) {
        const record = await this.getShopRecord(shopId);
        return {
            shopCipher: this.requireValue(record, 'tiktokShopCipher', 'TIKTOK_SHOP_CIPHER', record.shopId),
            warehouseId: this.requireValue(record, 'tiktokWarehouseId', 'TIKTOK_WAREHOUSE_ID', record.shopId),
            defaultCategoryId: this.requireValue(record, 'tiktokDefaultCategoryId', 'TIKTOK_DEFAULT_CATEGORY_ID', record.shopId),
            brandId: this.normalizeOptional(record.tiktokBrandId),
            brandName: this.normalizeOptional(record.tiktokBrandName),
        };
    }
    async getTiktokInventoryConfig(shopId) {
        const record = await this.getShopRecord(shopId);
        return {
            shopCipher: this.requireValue(record, 'tiktokShopCipher', 'TIKTOK_SHOP_CIPHER', record.shopId),
            warehouseId: this.requireValue(record, 'tiktokWarehouseId', 'TIKTOK_WAREHOUSE_ID', record.shopId),
        };
    }
    async getTiktokOrderConfig(shopId) {
        const record = await this.getShopRecord(shopId);
        return {
            shopCipher: this.requireValue(record, 'tiktokShopCipher', 'TIKTOK_SHOP_CIPHER', record.shopId),
        };
    }
    async getTiktokDefaultCategoryId(shopId) {
        const record = await this.getShopRecord(shopId);
        return this.normalizeOptional(record.tiktokDefaultCategoryId);
    }
    async resolveShopIdByVtexWebhookToken(token) {
        const normalized = this.normalizeOptional(token);
        if (!normalized) {
            throw new common_1.BadRequestException('Missing VTEX webhook token');
        }
        const record = await this.prisma.tiktokAuth.findFirst({
            where: { vtexWebhookToken: normalized },
            select: { shopId: true },
        });
        if (!record) {
            throw new common_1.UnauthorizedException('Invalid VTEX webhook token');
        }
        return record.shopId;
    }
    async getShopRecord(shopId) {
        const normalized = this.normalizeOptional(shopId);
        if (!normalized) {
            throw new common_1.BadRequestException('Missing shop id');
        }
        const record = await this.prisma.tiktokAuth.findUnique({
            where: { shopId: normalized },
        });
        if (!record) {
            throw new common_1.NotFoundException(`Shop ${normalized} not found`);
        }
        return record;
    }
    normalizeOptional(value) {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    requireValue(record, key, label, shopId) {
        const value = this.normalizeOptional(record[key]);
        if (!value) {
            throw new common_1.BadRequestException(`Missing ${label} for shop ${shopId}`);
        }
        return value;
    }
};
exports.ShopConfigService = ShopConfigService;
exports.ShopConfigService = ShopConfigService = ShopConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        nestjs_pino_1.PinoLogger])
], ShopConfigService);
//# sourceMappingURL=shop-config.service.js.map