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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CatalogController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const nestjs_pino_1 = require("nestjs-pino");
const auth_guard_1 = require("../auth/auth.guard");
const catalog_service_1 = require("./catalog.service");
const dto_1 = require("../common/dto");
let CatalogController = CatalogController_1 = class CatalogController {
    constructor(catalogService, logger) {
        this.catalogService = catalogService;
        this.logger = logger;
        this.logger.setContext(CatalogController_1.name);
    }
    async syncCatalog(shopId, payload) {
        if (!shopId) {
            throw new common_1.BadRequestException('Missing x-tts-shopid header');
        }
        this.logger.info({ shopId, payload }, 'Starting catalog sync request');
        const result = await this.catalogService.syncCatalog(shopId, payload);
        this.logger.info({
            shopId,
            processed: result.processed,
            synced: result.synced,
            failed: result.failed,
            remaining: result.remaining,
        }, 'Finished catalog sync request');
        return result;
    }
    async syncCatalogByProduct(productId, shopId) {
        return this.catalogService.syncProduct(shopId, productId);
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, common_1.Headers)('x-tts-shopid')),
    __param(1, (0, common_1.Body)(new dto_1.ZodValidationPipe(dto_1.catalogSyncSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "syncCatalog", null);
__decorate([
    (0, common_1.Post)('sync/:productId'),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Headers)('x-tts-shopid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "syncCatalogByProduct", null);
exports.CatalogController = CatalogController = CatalogController_1 = __decorate([
    (0, swagger_1.ApiSecurity)('middlewareApiKey'),
    (0, swagger_1.ApiHeader)({
        name: 'x-api-key',
        required: true,
        description: 'Chave interna do middleware para autorizar o acesso às rotas',
    }),
    (0, common_1.UseGuards)(auth_guard_1.ApiKeyAuthGuard),
    (0, common_1.Controller)('internal/catalog'),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService,
        nestjs_pino_1.PinoLogger])
], CatalogController);
//# sourceMappingURL=catalog.controller.js.map