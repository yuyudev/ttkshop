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
exports.TiktokShopService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../prisma/prisma.service");
const token_crypto_service_1 = require("../common/token-crypto.service");
let TiktokShopService = class TiktokShopService {
    constructor(http, prisma, tokenCrypto, configService) {
        this.http = http;
        this.prisma = prisma;
        this.tokenCrypto = tokenCrypto;
        this.configService = configService;
        this.authBase = this.configService.getOrThrow('TIKTOK_BASE_AUTH', { infer: true });
        this.appKey = this.configService.getOrThrow('TIKTOK_APP_KEY', { infer: true });
        this.appSecret = this.configService.getOrThrow('TIKTOK_APP_SECRET', { infer: true });
    }
    async exchangeAuthorizationCode(code, explicitShopId) {
        const url = `${this.authBase}/api/v2/token/get`;
        const params = new URLSearchParams({
            grant_type: 'authorized_code',
            auth_code: code,
            app_key: this.appKey,
            app_secret: this.appSecret,
        });
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.post(url, null, { params }));
        const payload = data.data;
        const shopId = explicitShopId ?? payload.shop_id;
        if (!shopId) {
            throw new Error('TikTok response did not include shop_id');
        }
        const refreshTokenEncrypted = this.tokenCrypto.encrypt(payload.refresh_token);
        const accessExpiresAt = this.calculateExpiry(payload.access_token_expire_in);
        const refreshExpiresAt = this.calculateExpiry(payload.refresh_token_expire_in ?? 0);
        await this.prisma.tiktokAuth.upsert({
            where: { shopId },
            update: {
                accessToken: payload.access_token,
                accessExpiresAt,
                refreshToken: refreshTokenEncrypted,
                scopes: payload.scope,
            },
            create: {
                shopId,
                accessToken: payload.access_token,
                accessExpiresAt,
                refreshToken: refreshTokenEncrypted,
                scopes: payload.scope,
            },
        });
        return { shopId, accessToken: payload.access_token, refreshExpiresAt };
    }
    async refresh(shopId) {
        const record = await this.prisma.tiktokAuth.findUnique({
            where: { shopId },
        });
        if (!record) {
            throw new common_1.NotFoundException(`No TikTok auth record for shop ${shopId}`);
        }
        const refreshToken = this.tokenCrypto.decrypt(record.refreshToken);
        const url = `${this.authBase}/api/v2/token/get`;
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            app_key: this.appKey,
            app_secret: this.appSecret,
        });
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.post(url, null, { params }));
        const payload = data.data;
        const refreshTokenEncrypted = this.tokenCrypto.encrypt(payload.refresh_token);
        await this.prisma.tiktokAuth.update({
            where: { shopId },
            data: {
                accessToken: payload.access_token,
                accessExpiresAt: this.calculateExpiry(payload.access_token_expire_in),
                refreshToken: refreshTokenEncrypted,
                scopes: payload.scope,
            },
        });
        return payload.access_token;
    }
    async getAccessToken(shopId) {
        const record = await this.prisma.tiktokAuth.findUnique({
            where: { shopId },
        });
        if (!record) {
            throw new common_1.NotFoundException(`No TikTok token found for shop ${shopId}`);
        }
        const isExpired = !record.accessExpiresAt || record.accessExpiresAt.getTime() < Date.now() + 60_000;
        if (isExpired) {
            return this.refresh(shopId);
        }
        return record.accessToken;
    }
    calculateExpiry(seconds) {
        if (!seconds) {
            return new Date(Date.now() + 5 * 60 * 1000);
        }
        return new Date(Date.now() + seconds * 1000);
    }
};
exports.TiktokShopService = TiktokShopService;
exports.TiktokShopService = TiktokShopService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        prisma_service_1.PrismaService,
        token_crypto_service_1.TokenCryptoService,
        config_1.ConfigService])
], TiktokShopService);
//# sourceMappingURL=tiktokshop.service.js.map