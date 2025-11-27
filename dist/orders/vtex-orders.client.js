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
var VtexOrdersClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VtexOrdersClient = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const nestjs_pino_1 = require("nestjs-pino");
let VtexOrdersClient = VtexOrdersClient_1 = class VtexOrdersClient {
    constructor(http, configService, logger) {
        this.http = http;
        this.configService = configService;
        this.logger = logger;
        this.logger.setContext(VtexOrdersClient_1.name);
        this.account = this.configService.getOrThrow('VTEX_ACCOUNT', { infer: true });
        this.environment = this.configService.getOrThrow('VTEX_ENVIRONMENT', { infer: true });
        this.domainOverride = this.configService.get('VTEX_DOMAIN', { infer: true });
    }
    async createOrder(payload) {
        const url = `${this.baseUrl()}/fulfillment/pvt/orders`;
        const sc = this.configService.get('VTEX_SALES_CHANNEL') ?? '1';
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, {
            headers: this.headers(),
            params: { sc }
        }));
    }
    async getOrder(orderId) {
        const url = `${this.baseUrl()}/oms/pvt/orders/${orderId}`;
        return (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.headers() }));
    }
    async simulateOrder(items, postalCode, country) {
        const url = `${this.baseUrl()}/checkout/pub/orderForms/simulation`;
        const payload = {
            items: items.map(item => ({
                id: item.id,
                quantity: item.quantity,
                seller: item.seller,
            })),
            postalCode,
            country,
        };
        this.logger.info({ url, payload }, 'Calling VTEX simulation endpoint');
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, { headers: this.headers() }));
    }
    async updateTracking(orderId, invoiceData) {
        const url = `${this.baseUrl()}/oms/pvt/orders/${orderId}/invoice`;
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, invoiceData, { headers: this.headers() }));
    }
    baseUrl() {
        if (this.domainOverride) {
            const base = this.domainOverride.startsWith('http')
                ? this.domainOverride
                : `https://${this.domainOverride}`;
            return base.replace(/\/+$/, '') + '/api';
        }
        const suffix = this.environment.includes('.')
            ? this.environment
            : `${this.environment}.com`;
        return `https://${this.account}.${suffix}/api`;
    }
    headers() {
        const appKey = this.configService.getOrThrow('VTEX_APP_KEY', { infer: true });
        const appToken = this.configService.getOrThrow('VTEX_APP_TOKEN', { infer: true });
        return {
            'X-VTEX-API-AppKey': appKey,
            'X-VTEX-API-AppToken': appToken,
            'Content-Type': 'application/json',
        };
    }
};
exports.VtexOrdersClient = VtexOrdersClient;
exports.VtexOrdersClient = VtexOrdersClient = VtexOrdersClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        nestjs_pino_1.PinoLogger])
], VtexOrdersClient);
//# sourceMappingURL=vtex-orders.client.js.map