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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const shop_config_service_1 = require("../common/shop-config.service");
const dto_1 = require("../common/dto");
const orders_service_1 = require("./orders.service");
let OrdersController = class OrdersController {
    constructor(ordersService, shopConfigService) {
        this.ordersService = ordersService;
        this.shopConfigService = shopConfigService;
    }
    async handleWebhook(payload) {
        const data = payload?.data;
        if (!data || !data.order_id) {
            return { status: 'ignored' };
        }
        const parser = new dto_1.ZodValidationPipe(dto_1.orderWebhookSchema);
        let orderPayload;
        try {
            orderPayload = parser.transform(payload);
        }
        catch (error) {
            throw new common_1.BadRequestException(error?.response ?? 'Invalid TikTok order webhook payload');
        }
        const status = await this.ordersService.handleWebhook(orderPayload);
        return { status };
    }
    async getLabel(orderId) {
        return this.ordersService.getLabel(orderId);
    }
    async handleVtexMarketplace(token, payload) {
        const shopId = await this.shopConfigService.resolveShopIdByVtexWebhookToken(token);
        this.ordersService.scheduleVtexMarketplaceNotification(payload, shopId);
        return { status: 'accepted' };
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)('webhooks/tiktok/orders'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)(new dto_1.ZodValidationPipe(dto_1.tiktokWebhookSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "handleWebhook", null);
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.ApiKeyAuthGuard),
    (0, common_1.Get)('orders/:ttsOrderId/label'),
    __param(0, (0, common_1.Param)('ttsOrderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getLabel", null);
__decorate([
    (0, common_1.Post)('webhooks/vtex/marketplace/:token'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "handleVtexMarketplace", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        shop_config_service_1.ShopConfigService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map