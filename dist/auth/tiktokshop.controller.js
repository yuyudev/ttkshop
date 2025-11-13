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
var TiktokShopController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiktokShopController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_pino_1 = require("nestjs-pino");
const dto_1 = require("../common/dto");
const tiktokshop_service_1 = require("./tiktokshop.service");
let TiktokShopController = TiktokShopController_1 = class TiktokShopController {
    constructor(tiktokShopService, configService, logger) {
        this.tiktokShopService = tiktokShopService;
        this.configService = configService;
        this.logger = logger;
        this.logger.setContext(TiktokShopController_1.name);
    }
    async callback(res, query) {
        try {
            const code = query.auth_code ?? query.code;
            const shopId = this.resolveShopId(query);
            const result = await this.tiktokShopService.exchangeAuthorizationCode(code, shopId);
            const publicBaseUrl = this.configService.getOrThrow('PUBLIC_BASE_URL', {
                infer: true,
            });
            this.logger.info({ shopId: result.shopId }, 'TikTok authorization completed');
            if (publicBaseUrl) {
                const redirectUrl = new URL(publicBaseUrl);
                const successPath = this.configService.getOrThrow('TTS_REDIRECT_PATH', {
                    infer: true,
                });
                redirectUrl.pathname = successPath.endsWith('/success')
                    ? successPath
                    : `${successPath.replace(/\/$/, '')}/success`;
                return res.redirect(302, redirectUrl.toString());
            }
            return res.json({
                message: 'Autorização concluída',
                shopId: result.shopId,
            });
        }
        catch (err) {
            this.logger.error({ err }, 'Failed to exchange TikTok authorization code');
            return res.status(500).json({
                message: 'Erro ao trocar código por token TikTok',
            });
        }
    }
    resolveShopId(query) {
        if (query.shop_id) {
            return query.shop_id;
        }
        if (!query.state) {
            return undefined;
        }
        try {
            const decoded = Buffer.from(query.state, 'base64').toString('utf8');
            const payload = JSON.parse(decoded);
            return payload.shopId;
        }
        catch (error) {
            this.logger.warn({ err: error }, 'Failed to parse state payload for shop id');
            return undefined;
        }
    }
};
exports.TiktokShopController = TiktokShopController;
__decorate([
    (0, common_1.Get)('callback'),
    __param(0, (0, common_1.Res)()),
    __param(1, (0, common_1.Query)(new dto_1.ZodValidationPipe(dto_1.tikTokCallbackQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TiktokShopController.prototype, "callback", null);
exports.TiktokShopController = TiktokShopController = TiktokShopController_1 = __decorate([
    (0, common_1.Controller)('oauth/tiktokshop'),
    __metadata("design:paramtypes", [tiktokshop_service_1.TiktokShopService,
        config_1.ConfigService,
        nestjs_pino_1.PinoLogger])
], TiktokShopController);
//# sourceMappingURL=tiktokshop.controller.js.map