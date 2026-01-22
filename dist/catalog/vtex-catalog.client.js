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
const shop_config_service_1 = require("../common/shop-config.service");
let VtexCatalogClient = class VtexCatalogClient {
    constructor(http, configService, shopConfigService, logger) {
        this.http = http;
        this.configService = configService;
        this.shopConfigService = shopConfigService;
        this.logger = logger;
    }
    async listSkus(shopId, updatedFrom) {
        const pageSize = Number(this.configService.get('VTEX_PAGE_SIZE', { infer: true })) || 50;
        const limit = Number(this.configService.get('VTEX_PAGE_LIMIT', { infer: true })) || 20;
        const results = [];
        for (let currentPage = 1; currentPage <= limit; currentPage++) {
            const ids = await this.fetchSkuPage(shopId, currentPage, pageSize, updatedFrom);
            if (!ids.length) {
                break;
            }
            results.push(...ids);
            if (ids.length < pageSize) {
                break;
            }
        }
        return results.map((id) => ({ id: String(id), productId: String(id), name: '' }));
    }
    async fetchSkuPage(shopId, page, pageSize, updatedFrom) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pvt/sku/stockkeepingunitids`;
        const params = {
            page: String(page),
            pagesize: String(pageSize),
        };
        if (updatedFrom) {
            params['lastModifiedDate'] = updatedFrom;
        }
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
                params,
                headers: this.buildDefaultHeaders(vtexConfig),
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
                return body.data
                    .map((item) => item?.id ?? item?.skuId)
                    .filter(Boolean)
                    .map(String);
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
            this.logger.warn({ page, pageSize, body }, 'VTEX listSkus returned unexpected payload; treating as empty result');
            return [];
        }
        catch (error) {
            this.logger.error({ err: error, page, pageSize }, 'Failed to list VTEX SKUs');
            throw error;
        }
    }
    async getSkuInventory(shopId, skuId, warehouseId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }));
        const parseQuantity = (value) => {
            if (value === null || value === undefined) {
                return 0;
            }
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const extractQuantity = (payload) => {
            if (!payload || typeof payload !== 'object') {
                return 0;
            }
            const candidates = [
                payload.availableQuantity,
                payload.totalQuantity,
                payload.quantity,
            ];
            for (const value of candidates) {
                if (value !== undefined && value !== null) {
                    return parseQuantity(value);
                }
            }
            return 0;
        };
        if (Array.isArray(data)) {
            return data.reduce((sum, item) => sum + extractQuantity(item), 0);
        }
        if (data && typeof data === 'object') {
            return extractQuantity(data);
        }
        this.logger.warn({ skuId, warehouseId, body: data }, 'VTEX getSkuInventory returned unexpected payload; assuming zero quantity');
        return 0;
    }
    async getSkuById(shopId, skuId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/stockkeepingunit/${skuId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }));
        return data;
    }
    async getProductWithSkus(shopId, productId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }));
        return data;
    }
    async searchProductWithItems(shopId, productId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog_system/pub/products/search/`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
            headers: this.buildDefaultHeaders(vtexConfig),
            params: {
                fq: `productId:${productId}`,
            },
        }));
        return data;
    }
    async getProductById(shopId, productId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/product/${productId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }));
        return data;
    }
    async getPrice(shopId, skuId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildPricingBaseUrl(vtexConfig)}/pricing/prices/${skuId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers: this.buildDefaultHeaders(vtexConfig) }));
        return data.basePrice;
    }
    async setPrice(shopId, skuId, price) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildPricingBaseUrl(vtexConfig)}/pricing/prices/${skuId}`;
        await (0, rxjs_1.firstValueFrom)(this.http.put(url, {
            listPrice: price,
            basePrice: price,
        }, { headers: this.buildDefaultHeaders(vtexConfig) }));
    }
    async updateStock(shopId, skuId, warehouseId, quantity) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/logistics/pvt/inventory/items/${skuId}/warehouses/${warehouseId}`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.put(url, { quantity }, { headers: this.buildDefaultHeaders(vtexConfig) }));
        return data;
    }
    async getSkuImages(shopId, skuId) {
        const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
        const url = `${this.buildBaseUrl(vtexConfig)}/catalog/pvt/stockkeepingunit/${skuId}/file`;
        const { data } = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
            headers: this.buildDefaultHeaders(vtexConfig),
        }));
        if (!Array.isArray(data)) {
            this.logger.warn({ skuId, body: data }, 'VTEX getSkuImages returned unexpected payload; returning empty list');
            return [];
        }
        return data
            .map((file) => ({
            url: this.buildVtexImageUrl(file, vtexConfig.account),
            isMain: Boolean(file?.IsMain) || file?.Position === 0,
            position: Number(file?.Position ?? 9999),
        }))
            .filter((image) => Boolean(image.url))
            .map((image) => ({
            url: image.url,
            isMain: image.isMain,
            position: image.position,
        }));
    }
    buildVtexImageUrl(file, account) {
        const rawLocation = (typeof file?.FileLocation === 'string' && file.FileLocation) ||
            (typeof file?.fileLocation === 'string' && file.fileLocation) ||
            '';
        const formatted = this.normalizeFileLocation(rawLocation, account);
        if (formatted) {
            return formatted;
        }
        const fallback = (typeof file?.Url === 'string' && file.Url) ||
            (typeof file?.url === 'string' && file.url) ||
            '';
        return fallback?.trim() || undefined;
    }
    normalizeFileLocation(location, account) {
        if (!location) {
            return undefined;
        }
        const trimmed = location.trim();
        if (!trimmed) {
            return undefined;
        }
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        const sanitized = trimmed.replace(/^\/+/, '');
        if (!sanitized) {
            return undefined;
        }
        const accountPrefix = `${account}.`;
        const prefixed = sanitized.startsWith(accountPrefix)
            ? sanitized
            : `${accountPrefix}${sanitized}`;
        return `https://${prefixed}`;
    }
    buildBaseUrl(config) {
        if (config.domain) {
            const domain = config.domain.startsWith('http')
                ? config.domain
                : `https://${config.domain}`;
            return `${domain.replace(/\/+$/, '')}/api`;
        }
        const suffix = config.environment.includes('.')
            ? config.environment
            : `${config.environment}.com`;
        return `https://${config.account}.${suffix}/api`;
    }
    buildPricingBaseUrl(config) {
        if (config.pricingDomain) {
            const domain = config.pricingDomain.startsWith('http')
                ? config.pricingDomain
                : `https://${config.pricingDomain}`;
            return domain.replace(/\/+$/, '');
        }
        return `https://api.vtex.com/${config.account}`;
    }
    buildDefaultHeaders(config) {
        return {
            'X-VTEX-API-AppKey': config.appKey,
            'X-VTEX-API-AppToken': config.appToken,
            'Content-Type': 'application/json',
        };
    }
};
exports.VtexCatalogClient = VtexCatalogClient;
exports.VtexCatalogClient = VtexCatalogClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        shop_config_service_1.ShopConfigService,
        nestjs_pino_1.PinoLogger])
], VtexCatalogClient);
//# sourceMappingURL=vtex-catalog.client.js.map