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
exports.TiktokLogisticsClient = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const tiktokshop_service_1 = require("../auth/tiktokshop.service");
let TiktokLogisticsClient = class TiktokLogisticsClient {
    constructor(http, configService, tiktokShopService) {
        this.http = http;
        this.configService = configService;
        this.tiktokShopService = tiktokShopService;
        this.servicesBase = this.configService.getOrThrow('TIKTOK_BASE_SERV', { infer: true });
    }
    async getOrCreateShippingDocument(shopId, orderId) {
        return this.request(shopId, 'post', '/api/logistics/shipping_document', {
            order_id: orderId,
        });
    }
    async getShippingDocument(shopId, orderId) {
        return this.request(shopId, 'get', `/api/logistics/shipping_document/${orderId}`);
    }
    async request(shopId, method, path, payload) {
        const token = await this.tiktokShopService.getAccessToken(shopId);
        const url = `${this.servicesBase}${path}`;
        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        if (method === 'get') {
            return (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers }));
        }
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, { headers }));
    }
};
exports.TiktokLogisticsClient = TiktokLogisticsClient;
exports.TiktokLogisticsClient = TiktokLogisticsClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        tiktokshop_service_1.TiktokShopService])
], TiktokLogisticsClient);
//# sourceMappingURL=tiktok-logistics.client.js.map