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
exports.VtexCatalogClient = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
let VtexCatalogClient = class VtexCatalogClient {
    constructor(http, configService, logger) {
        this.http = http;
        this.configService = configService;
        this.logger = logger;
        this.account = this.configService.getOrThrow('VTEX_ACCOUNT', { infer: true });
        this.environment = this.configService.getOrThrow('VTEX_ENVIRONMENT', { infer: true });
        this.domainOverride = this.configService.get('VTEX_DOMAIN', { infer: true });
    }
    async listSkus(updatedFrom) {
        const pageSize = Number(this.configService.get('VTEX_PAGE_SIZE', { infer: true })) || 50;
        const limit = Number(this.configService.get('VTEX_PAGE_LIMIT', { infer: true })) || 20;
        const results = [];
        let page = 0;
        while (page < limit) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const ids = await this.fetchSkuRange(from, to, updatedFrom);
            if (!ids.length) {
                break;
            }
            results.push(...ids);
            if (ids.length < pageSize) {
                break;
            }
            page += 1;
        }
        return results.map((id) => ({ id: String(id), productId: String(id), name: '' }));
    }
    async fetchSkuRange(from, to, updatedFrom) {
        const url = `${this.baseUrl()}/catalog_system/pvt/sku/stockkeepingunitids`;
        const params = {
            from: String(from),
            to: String(to),
            page: String(Math.floor(from / Math.max(to - from + 1, 1)) + 1),
            pageSize: String(to - from + 1),
        };
        if (updatedFrom) {
            params['lastModifiedDate'] = updatedFrom;
        }
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
                params,
                headers: this.defaultHeaders(),
                maxRedirects: 5,
            }));
            const body = response.data;
            if (Array.isArray(body)) {
                return body.map(String);
            }
            if (Array.isArray(body?.items)) {
                return body.items
                    .map((item) => (typeof item === 'object' ? item?.id ?? item?.skuId : item))
                    .filter(Boolean)
                    .map(String);
            }
            if (Array.isArray(body?.data)) {
                return body.data.map((item) => item?.id ?? item?.skuId).filter(Boolean).map(String);
            }
            if (typeof body === 'object' && body !== null) {
                const candidate = body.skus ?? body.result ?? body.pageItems;
                if (Array.isArray(candidate)) {
                    return candidate
                        .map((item) => item?.id ?? item?.skuId ?? item)
                        .filter(Boolean)
                        .map(String);
                }
            }
            this.logger.warn({ from, to, body }, 'VTEX listSkus returned unexpected payload; treating as empty result');
            return [];
        }
        catch (error) {
            this.logger.error({ err: error, from, to }, 'Failed to list VTEX SKUs');
            throw error;
        }
    }
    async getSkuById(skuId) {
        const url = `${this.baseUrl()}/catalog/pvt/stockkeepingunit/${skuId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.defaultHeaders() }));
        return data;
    }
    async getProductWithSkus(productId) {
        const url = `${this.baseUrl()}/catalog/pvt/product/${productId}/skus`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.defaultHeaders() }));
        return data;
    }
    async searchProductWithItems(productId) {
        const url = `${this.baseUrl()}/catalog_system/pub/products/search/`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
            headers: this.defaultHeaders(),
            params: {
                fq: `productId:${productId}`,
            },
        }));
        return data;
    }
    async getProductById(productId) {
        const url = `${this.baseUrl()}/catalog/pvt/product/${productId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.defaultHeaders() }));
        return data;
    }
    async getPrice(skuId) {
        const url = `${this.baseUrl()}/pricing/prices/${skuId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.defaultHeaders() }));
        return data.basePrice;
    }
    async setPrice(skuId, price) {
        const url = `${this.baseUrl()}/pricing/prices/${skuId}`;
        await (0, rxjs_1.firstValueFrom)(this.http.put(url, {
            listPrice: price,
            basePrice: price,
        }, { headers: this.defaultHeaders() }));
    }
    async updateStock(skuId, warehouseId, quantity) {
        const url = `${this.baseUrl()}/logistics/pvt/inventory/skus/${skuId}/warehouses/${warehouseId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.put(url, { quantity }, { headers: this.defaultHeaders() }));
        return data;
    }
    async getSkuImages(skuId) {
        const url = `${this.baseUrl()}/catalog/pvt/stockkeepingunit/${skuId}/file`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
            headers: this.defaultHeaders(),
        }));
        if (!Array.isArray(data)) {
            this.logger.warn({ skuId, body: data }, 'VTEX getSkuImages returned unexpected payload; returning empty list');
            return [];
        }
        return data
            .map((file) => ({
            url: file?.Url ?? file?.url,
            isMain: Boolean(file?.IsMain) || file?.Position === 0,
            position: Number(file?.Position ?? 9999),
        }))
            .filter((image) => Boolean(image.url));
    }
    baseUrl() {
        if (this.domainOverride) {
            const domain = this.domainOverride.startsWith('http')
                ? this.domainOverride
                : `https://${this.domainOverride}`;
            return `${domain.replace(/\/+$/, '')}/api`;
        }
        const suffix = this.environment.includes('.')
            ? this.environment
            : `${this.environment}.com`;
        return `https://${this.account}.${suffix}/api`;
    }
    defaultHeaders() {
        const appKey = this.configService.getOrThrow('VTEX_APP_KEY', { infer: true });
        const appToken = this.configService.getOrThrow('VTEX_APP_TOKEN', { infer: true });
        return {
            'X-VTEX-API-AppKey': appKey,
            'X-VTEX-API-AppToken': appToken,
            'Content-Type': 'application/json',
        };
    }
};
exports.VtexCatalogClient = VtexCatalogClient;
exports.VtexCatalogClient = VtexCatalogClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        nestjs_pino_1.PinoLogger])
], VtexCatalogClient);
//# sourceMappingURL=vtex-catalog.client.js.map