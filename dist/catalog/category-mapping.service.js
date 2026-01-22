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
var CategoryMappingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryMappingService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
const category_ai_service_1 = require("./category-ai.service");
const shop_config_service_1 = require("../common/shop-config.service");
let CategoryMappingService = CategoryMappingService_1 = class CategoryMappingService {
    constructor(prisma, logger, aiService, shopConfigService) {
        this.prisma = prisma;
        this.logger = logger;
        this.aiService = aiService;
        this.shopConfigService = shopConfigService;
        this.logger.setContext(CategoryMappingService_1.name);
    }
    async resolveCategory(product, shopId) {
        const fallbackCategoryId = await this.shopConfigService.getTiktokDefaultCategoryId(shopId);
        const vtexCategoryId = this.extractVtexCategoryId(product);
        const categoryMapClient = this.prisma?.vtexCategoryMap;
        if (vtexCategoryId) {
            if (!categoryMapClient) {
                throw new Error('Prisma client is missing VtexCategoryMap model. Run `npx prisma generate` after updating the schema.');
            }
            const mapping = await categoryMapClient.findUnique({
                where: { vtexCategoryId },
            });
            if (mapping) {
                return { categoryId: mapping.tiktokCategoryId, source: 'mapping' };
            }
        }
        const aiResult = await this.aiService.suggestCategory(product);
        if (aiResult.categoryId) {
            if (vtexCategoryId && categoryMapClient) {
                await categoryMapClient.upsert({
                    where: { vtexCategoryId },
                    update: {
                        tiktokCategoryId: aiResult.categoryId,
                        confidence: aiResult.confidence,
                        notes: aiResult.reasoning,
                    },
                    create: {
                        vtexCategoryId,
                        tiktokCategoryId: aiResult.categoryId,
                        confidence: aiResult.confidence,
                        notes: aiResult.reasoning,
                    },
                });
            }
            return { categoryId: aiResult.categoryId, source: 'ai' };
        }
        if (!fallbackCategoryId) {
            this.logger.error({
                productId: product.Id,
                vtexCategoryId,
            }, 'Unable to find TikTok category mapping and fallback is not configured');
            throw new Error(`Unable to resolve TikTok category for product ${product.Id}: configure TIKTOK_DEFAULT_CATEGORY_ID in the shop config or provide a mapping`);
        }
        return { categoryId: fallbackCategoryId, source: 'fallback' };
    }
    extractVtexCategoryId(product) {
        const categoryId = product?.CategoryId ??
            product?.categoryId ??
            product?.DepartmentId ??
            null;
        if (!categoryId) {
            return null;
        }
        const normalized = String(categoryId).trim();
        return normalized || null;
    }
};
exports.CategoryMappingService = CategoryMappingService;
exports.CategoryMappingService = CategoryMappingService = CategoryMappingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        nestjs_pino_1.PinoLogger,
        category_ai_service_1.CategoryAiService,
        shop_config_service_1.ShopConfigService])
], CategoryMappingService);
//# sourceMappingURL=category-mapping.service.js.map