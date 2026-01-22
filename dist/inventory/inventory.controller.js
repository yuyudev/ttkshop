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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../auth/auth.guard");
const inventory_service_1 = require("./inventory.service");
const dto_1 = require("../common/dto");
const shop_config_service_1 = require("../common/shop-config.service");
let InventoryController = class InventoryController {
    constructor(inventoryService, shopConfigService) {
        this.inventoryService = inventoryService;
        this.shopConfigService = shopConfigService;
    }
    async handleVtexWebhook(payload) {
        this.inventoryService.scheduleVtexInventory(payload);
        return { status: 'accepted' };
    }
    async handleVtexNotification(token, payload) {
        const shopId = await this.shopConfigService.resolveShopIdByVtexWebhookToken(token);
        this.inventoryService.scheduleVtexNotification(payload, shopId);
        return { status: 'accepted' };
    }
    async manualSync(shopId, payload) {
        if (!shopId) {
            throw new common_1.BadRequestException('Missing x-tts-shopid header');
        }
        return this.inventoryService.syncInventory(shopId, payload);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.ApiKeyAuthGuard),
    (0, common_1.Post)('webhooks/vtex/inventory'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "handleVtexWebhook", null);
__decorate([
    (0, common_1.Post)('webhooks/vtex/notify/:token'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "handleVtexNotification", null);
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.ApiKeyAuthGuard),
    (0, common_1.Post)('internal/inventory/sync'),
    __param(0, (0, common_1.Headers)('x-tts-shopid')),
    __param(1, (0, common_1.Body)(new dto_1.ZodValidationPipe(dto_1.inventorySyncSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "manualSync", null);
exports.InventoryController = InventoryController = __decorate([
    (0, swagger_1.ApiSecurity)('middlewareApiKey'),
    (0, swagger_1.ApiHeader)({
        name: 'x-api-key',
        required: true,
        description: 'Chave interna do middleware para autorizar o acesso às rotas',
    }),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService,
        shop_config_service_1.ShopConfigService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map