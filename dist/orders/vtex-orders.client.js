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
const rxjs_1 = require("rxjs");
const nestjs_pino_1 = require("nestjs-pino");
const shop_config_service_1 = require("../common/shop-config.service");
let VtexOrdersClient = VtexOrdersClient_1 = class VtexOrdersClient {
    constructor(http, shopConfigService, logger) {
        this.http = http;
        this.shopConfigService = shopConfigService;
        this.logger = logger;
        this.logger.setContext(VtexOrdersClient_1.name);
    }
    async createOrder(shopId, payload) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/fulfillment/pvt/orders`;
        const sc = vtexConfig.salesChannel;
        const affiliateId = vtexConfig.affiliateId;
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, {
            headers: this.buildHeaders(vtexConfig),
            params: {
                sc,
                ...(affiliateId ? { affiliateId } : {}),
            },
        }));
    }
    async getOrder(shopId, orderId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/oms/pvt/orders/${orderId}`;
        return (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildHeaders(vtexConfig) }));
    }
    async simulateOrder(shopId, items, postalCode, country) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/checkout/pub/orderForms/simulation`;
        const sc = vtexConfig.salesChannel;
        const affiliateId = vtexConfig.affiliateId;
        const payloadItems = items.map((item) => {
            const entry = {
                id: item.id,
                quantity: item.quantity,
            };
            if (item.seller !== undefined && item.seller !== null && item.seller !== '') {
                entry.seller = item.seller;
            }
            return entry;
        });
        const payload = {
            items: payloadItems,
            postalCode,
            country,
        };
        this.logger.info({ url, payload, params: { sc, affiliateId: affiliateId ?? null } }, 'Calling VTEX simulation endpoint');
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, {
            headers: this.buildHeaders(vtexConfig),
            params: {
                sc,
                ...(affiliateId ? { affiliateId } : {}),
            },
        }));
    }
    async updateTracking(shopId, orderId, invoiceData) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/oms/pvt/orders/${orderId}/invoice`;
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, invoiceData, { headers: this.buildHeaders(vtexConfig) }));
    }
    async fetchInvoiceFile(shopId, invoiceUrl) {
        if (!invoiceUrl) {
            return null;
        }
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const headers = this.buildHeaders(vtexConfig);
        const baseUrl = this.buildBaseUrl(vtexConfig).replace(/\/api$/, '');
        const url = invoiceUrl.startsWith('http') ? invoiceUrl : `${baseUrl}${invoiceUrl}`;
        const response = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
            headers,
            responseType: 'text',
        }));
        if (typeof response.data === 'string') {
            return response.data;
        }
        if (response.data && Buffer.isBuffer(response.data)) {
            return response.data.toString('utf8');
        }
        return null;
    }
    async authorizeDispatch(shopId, orderId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/fulfillment/pvt/orders/${orderId}/fulfill`;
        return (0, rxjs_1.firstValueFrom)(this.http.post(url, null, { headers: this.buildHeaders(vtexConfig) }));
    }
    buildBaseUrl(config) {
        if (config.domain) {
            const base = config.domain.startsWith('http')
                ? config.domain
                : `https://${config.domain}`;
            return base.replace(/\/+$/, '') + '/api';
        }
        const suffix = config.environment.includes('.')
            ? config.environment
            : `${config.environment}.com`;
        return `https://${config.account}.${suffix}/api`;
    }
    buildHeaders(config) {
        return {
            'X-VTEX-API-AppKey': config.appKey,
            'X-VTEX-API-AppToken': config.appToken,
            'Content-Type': 'application/json',
        };
    }
};
exports.VtexOrdersClient = VtexOrdersClient;
exports.VtexOrdersClient = VtexOrdersClient = VtexOrdersClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        shop_config_service_1.ShopConfigService,
        nestjs_pino_1.PinoLogger])
], VtexOrdersClient);
//# sourceMappingURL=vtex-orders.client.js.map