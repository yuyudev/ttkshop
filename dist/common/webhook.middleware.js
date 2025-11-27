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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiktokWebhookMiddleware = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let TiktokWebhookMiddleware = class TiktokWebhookMiddleware {
    constructor(configService) {
        this.configService = configService;
    }
    use(req, res, next) {
        const signature = (req.headers['x-signature'] || req.headers['x-tt-signature'] || req.headers['authorization']);
        if (!signature) {
            throw new common_1.UnauthorizedException('Missing TikTok webhook signature header');
        }
        const secret = this.configService.getOrThrow('TIKTOK_APP_SECRET', { infer: true });
        const appKey = this.configService.getOrThrow('TIKTOK_APP_KEY', { infer: true });
        const rawBody = req.rawBody;
        const payload = typeof rawBody === 'string'
            ? rawBody
            : Buffer.isBuffer(rawBody)
                ? rawBody.toString('utf8')
                : typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body ?? {});
        const signatureBase = appKey + payload;
        const computed = (0, crypto_1.createHmac)('sha256', secret).update(signatureBase).digest('hex');
        if (computed !== signature) {
            throw new common_1.UnauthorizedException('Invalid TikTok webhook signature');
        }
        next();
    }
};
exports.TiktokWebhookMiddleware = TiktokWebhookMiddleware;
exports.TiktokWebhookMiddleware = TiktokWebhookMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TiktokWebhookMiddleware);
//# sourceMappingURL=webhook.middleware.js.map