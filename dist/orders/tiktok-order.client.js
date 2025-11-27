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
exports.TiktokOrderClient = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const tiktokshop_service_1 = require("../auth/tiktokshop.service");
const signer_1 = require("../common/signer");
let TiktokOrderClient = class TiktokOrderClient {
    constructor(http, configService, tiktokShopService) {
        this.http = http;
        this.configService = configService;
        this.tiktokShopService = tiktokShopService;
        this.openBase = this.configService.getOrThrow('TIKTOK_BASE_OPEN', { infer: true });
        this.appKey = this.configService.getOrThrow('TIKTOK_APP_KEY', { infer: true });
        this.appSecret = this.configService.getOrThrow('TIKTOK_APP_SECRET', { infer: true });
        this.shopCipher = this.configService.getOrThrow('TIKTOK_SHOP_CIPHER', { infer: true });
    }
    async listOrders(shopId, params = {}) {
        return this.request(shopId, 'get', '/order/202309/orders/search', undefined, params);
    }
    async getOrder(shopId, orderId) {
        return this.request(shopId, 'get', '/order/202309/orders', undefined, { ids: orderId });
    }
    async ackOrder(shopId, orderId) {
        return this.request(shopId, 'post', '/order/202309/orders/ack', { order_ids: [orderId] });
    }
    async request(shopId, method, path, payload, params) {
        const token = await this.tiktokShopService.getAccessToken(shopId);
        const baseUrl = this.openBase.replace(/\/$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const { url, headers, body } = (0, signer_1.buildSignedRequest)(baseUrl, cleanPath, this.appKey, this.appSecret, {
            qs: {
                shop_cipher: this.shopCipher,
                shop_id: shopId,
                ...params,
            },
            headers: {
                'x-tts-access-token': token,
            },
            body: payload,
        });
        if (method === 'get') {
            return (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers }));
        }
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, body, { headers }));
    }
};
exports.TiktokOrderClient = TiktokOrderClient;
exports.TiktokOrderClient = TiktokOrderClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        tiktokshop_service_1.TiktokShopService])
], TiktokOrderClient);
//# sourceMappingURL=tiktok-order.client.js.map