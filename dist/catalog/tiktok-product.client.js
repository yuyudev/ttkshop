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
var TiktokProductClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiktokProductClient = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const nestjs_pino_1 = require("nestjs-pino");
const tiktokshop_service_1 = require("../auth/tiktokshop.service");
const signer_1 = require("../common/signer");
let TiktokProductClient = TiktokProductClient_1 = class TiktokProductClient {
    constructor(http, configService, tiktokShopService, logger) {
        this.http = http;
        this.configService = configService;
        this.tiktokShopService = tiktokShopService;
        this.logger = logger;
        this.imageUriCache = new Map();
        this.openBase = this.normalizeBaseUrl(this.configService.getOrThrow('TIKTOK_BASE_OPEN', { infer: true }));
        this.appKey = this.configService.getOrThrow('TIKTOK_APP_KEY', { infer: true });
        this.appSecret = this.configService.getOrThrow('TIKTOK_APP_SECRET', { infer: true });
        this.shopCipher = this.configService.getOrThrow('TIKTOK_SHOP_CIPHER', { infer: true });
        this.shopId = this.configService.get('TIKTOK_SHOP_ID', { infer: true });
        this.categoryId = this.configService.getOrThrow('TIKTOK_DEFAULT_CATEGORY_ID', {
            infer: true,
        });
        this.brandId = this.configService.get('TIKTOK_BRAND_ID', { infer: true });
        this.brandName = this.configService.get('TIKTOK_BRAND_NAME', { infer: true });
        this.warehouseId = this.configService.getOrThrow('TIKTOK_WAREHOUSE_ID', {
            infer: true,
        });
        this.currency = this.configService.get('TIKTOK_CURRENCY', { infer: true }) ?? 'BRL';
        this.saveMode = this.configService.get('TIKTOK_SAVE_MODE', { infer: true }) ?? 'LISTING';
        this.fallbackDescription =
            this.configService.get('TIKTOK_DESCRIPTION_FALLBACK', { infer: true }) ??
                'No description provided.';
        this.packageWeight = this.configService.get('TIKTOK_PACKAGE_WEIGHT', { infer: true });
        this.packageWeightUnit =
            this.configService.get('TIKTOK_PACKAGE_WEIGHT_UNIT', { infer: true }) ?? 'KILOGRAM';
        this.packageLength = this.configService.get('TIKTOK_PACKAGE_LENGTH', { infer: true });
        this.packageWidth = this.configService.get('TIKTOK_PACKAGE_WIDTH', { infer: true });
        this.packageHeight = this.configService.get('TIKTOK_PACKAGE_HEIGHT', { infer: true });
        this.packageDimensionUnit =
            this.configService.get('TIKTOK_PACKAGE_DIMENSION_UNIT', { infer: true }) ??
                'CENTIMETER';
        this.minimumOrderQuantity = this.configService.get('TIKTOK_MINIMUM_ORDER_QUANTITY', { infer: true });
        const listingPlatforms = this.configService.get('TIKTOK_LISTING_PLATFORMS', { infer: true });
        this.listingPlatforms = Array.isArray(listingPlatforms) ? listingPlatforms : undefined;
        this.logger.setContext(TiktokProductClient_1.name);
    }
    async createProduct(shopId, input) {
        const accessToken = await this.tiktokShopService.getAccessToken(shopId);
        const payload = await this.buildProductPayload(shopId, accessToken, input);
        const url = this.buildSignedUrl('/product/202309/products');
        const headers = this.buildHeaders(accessToken);
        const response = await (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, { headers }));
        return this.parseProductResponse(response.data);
    }
    async updateProduct(shopId, productId, input) {
        const accessToken = await this.tiktokShopService.getAccessToken(shopId);
        const payload = await this.buildProductPayload(shopId, accessToken, input, { productId });
        const url = this.buildSignedUrl(`/product/202309/products/${productId}`);
        const headers = this.buildHeaders(accessToken);
        const response = await (0, rxjs_1.firstValueFrom)(this.http.put(url, payload, { headers }));
        return this.parseProductResponse(response.data);
    }
    async updateStock(shopId, warehouseId, skuId, availableQuantity) {
        return this.legacyRequest(shopId, 'post', '/api/warehouse/stock/update', {
            warehouse_id: warehouseId,
            products: [
                {
                    sku_id: skuId,
                    available_stock: availableQuantity,
                },
            ],
        });
    }
    async legacyRequest(shopId, method, path, payload) {
        const accessToken = await this.tiktokShopService.getAccessToken(shopId);
        const url = `${this.openBase}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        };
        switch (method) {
            case 'get':
                return (0, rxjs_1.firstValueFrom)(this.http.get(url, { headers }));
            case 'post':
                return (0, rxjs_1.firstValueFrom)(this.http.post(url, payload, { headers }));
            case 'put':
                return (0, rxjs_1.firstValueFrom)(this.http.put(url, payload, { headers }));
            default:
                throw new Error(`Unsupported method ${method}`);
        }
    }
    buildSignedUrl(path, options = {}) {
        const timestamp = Math.floor(Date.now() / 1000);
        const params = {
            timestamp,
            ...(options.extraParams ?? {}),
        };
        if (options.includeShopCipher !== false) {
            params.shop_cipher = this.shopCipher;
        }
        if (options.includeShopId !== false && this.shopId) {
            params.shop_id = this.shopId;
        }
        const query = (0, signer_1.buildSignedQuery)(this.appKey, this.appSecret, path, params);
        return `${this.openBase}${path}?${query.toString()}`;
    }
    buildHeaders(accessToken) {
        return {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
        };
    }
    normalizeBaseUrl(url) {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
    parseProductResponse(data) {
        const productId = data?.data?.product_id ?? data?.product_id ?? null;
        const skuId = data?.data?.skus?.[0]?.id ??
            data?.data?.sku_id ??
            data?.skus?.[0]?.id ??
            null;
        return {
            productId,
            skuId,
            raw: data,
        };
    }
    async buildProductPayload(shopId, accessToken, input, options = {}) {
        const images = await this.prepareImages(shopId, accessToken, input.images);
        const priceAmount = this.formatPrice(input.price);
        const quantity = Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0);
        const brandId = this.brandId ?? (input.product.BrandId ? String(input.product.BrandId) : undefined);
        const brandName = this.brandName ?? input.product.BrandName ?? input.sku.BrandName ?? 'Generic';
        const categoryId = this.categoryId ?? (input.product.CategoryId ? String(input.product.CategoryId) : undefined);
        if (!categoryId) {
            throw new Error('Unable to determine TikTok category_id for product');
        }
        const description = this.buildDescription(input);
        const price = {
            amount: priceAmount,
            currency: this.currency,
            sale_price: priceAmount,
        };
        const inventory = [
            {
                warehouse_id: this.warehouseId,
                quantity: Math.floor(quantity).toString(),
            },
        ];
        const identifierCode = this.buildIdentifierCode(input.sku);
        const skuImgUri = images[0]?.uri;
        const supplementarySkuImages = images.slice(1).map((image) => ({ uri: image.uri }));
        const skuPayload = {
            seller_sku: String(input.vtexSkuId),
            external_sku_id: String(input.sku.RefId ?? input.sku.refId ?? input.vtexSkuId),
            price,
            inventory,
            identifier_code: identifierCode,
            sku_img: skuImgUri ? { uri: skuImgUri } : undefined,
            supplementary_sku_images: supplementarySkuImages.length > 0 ? supplementarySkuImages : undefined,
            sales_attributes: this.buildSalesAttributes(input),
            sku_unit_count: this.buildSkuUnitCount(input.sku),
        };
        const payload = {
            save_mode: this.saveMode,
            title: this.buildTitle(input),
            description,
            category_id: categoryId,
            brand_id: brandId,
            brand_name: brandName,
            main_images: images.map((image) => ({ uri: image.uri })),
            skus: [this.cleanPayload(skuPayload)],
            product_attributes: this.buildProductAttributes(input),
            package_dimensions: this.buildPackageDimensions(input),
            package_weight: this.buildPackageWeight(input),
            is_cod_allowed: false,
            is_pre_owned: false,
            idempotency_key: `vtex-${shopId}-${input.vtexSkuId}`,
            minimum_order_quantity: this.minimumOrderQuantity,
            listing_platforms: this.listingPlatforms,
        };
        if (!brandId) {
            delete payload.brand_id;
        }
        if (!brandName) {
            delete payload.brand_name;
        }
        if (!this.minimumOrderQuantity) {
            delete payload.minimum_order_quantity;
        }
        if (!this.listingPlatforms || this.listingPlatforms.length === 0) {
            delete payload.listing_platforms;
        }
        if (options.productId) {
            payload.product_id = options.productId;
        }
        return this.cleanPayload(payload);
    }
    async prepareImages(shopId, accessToken, images) {
        if (!images.length) {
            return [];
        }
        const sorted = [...images].sort((a, b) => a.position - b.position);
        const uris = [];
        for (const image of sorted) {
            const uri = await this.ensureImageUri(shopId, accessToken, image.url);
            if (uri) {
                uris.push(uri);
            }
        }
        if (uris.length === 0) {
            throw new Error('Unable to upload any product images to TikTok');
        }
        return uris.map((uri) => ({ uri }));
    }
    async ensureImageUri(shopId, accessToken, imageUrl) {
        const normalized = imageUrl?.trim();
        if (!normalized) {
            return null;
        }
        if (this.imageUriCache.has(normalized)) {
            return this.imageUriCache.get(normalized) ?? null;
        }
        try {
            const url = this.buildSignedUrl('/product/202309/images/upload', {
                includeShopCipher: false,
                includeShopId: false,
            });
            const headers = this.buildHeaders(accessToken);
            const response = await (0, rxjs_1.firstValueFrom)(this.http.post(url, {
                image_url: normalized,
            }, { headers }));
            const uri = response.data?.data?.uri ??
                response.data?.data?.image?.uri ??
                response.data?.uri ??
                null;
            if (!uri) {
                throw new Error('TikTok image upload did not return a URI');
            }
            this.imageUriCache.set(normalized, uri);
            return uri;
        }
        catch (error) {
            const errorPayload = error?.response?.data;
            this.logger.error({ err: error, errorPayload, imageUrl: normalized }, 'Failed to upload image to TikTok');
            return null;
        }
    }
    buildDescription(input) {
        const description = input.product.Description ??
            input.product.MetaTagDescription ??
            input.sku?.Description ??
            this.fallbackDescription;
        return description.toString().trim() || this.fallbackDescription;
    }
    buildTitle(input) {
        return (input.product.Title ??
            input.product.Name ??
            input.sku.name ??
            `SKU ${input.vtexSkuId}`);
    }
    buildIdentifierCode(sku) {
        const ean = (sku.EAN ?? sku.Ean ?? sku?.ean ?? '').toString().trim();
        if (!ean) {
            return undefined;
        }
        return {
            code: ean,
            type: 'GTIN',
        };
    }
    buildSkuUnitCount(sku) {
        if (!sku.UnitMultiplier || Number.isNaN(Number(sku.UnitMultiplier))) {
            return undefined;
        }
        return Number(sku.UnitMultiplier).toString();
    }
    buildSalesAttributes(_input) {
        return [];
    }
    buildProductAttributes(_input) {
        return [];
    }
    buildPackageDimensions(input) {
        const fallbackLength = this.packageLength ?? 10;
        const fallbackWidth = this.packageWidth ?? 10;
        const fallbackHeight = this.packageHeight ?? 10;
        const length = this.extractDimension(input.sku.PackedLength ?? input.sku.Length) ?? fallbackLength;
        const width = this.extractDimension(input.sku.PackedWidth ?? input.sku.Width) ?? fallbackWidth;
        const height = this.extractDimension(input.sku.PackedHeight ?? input.sku.Height) ?? fallbackHeight;
        return this.cleanPayload({
            length: this.formatNumber(length),
            width: this.formatNumber(width),
            height: this.formatNumber(height),
            unit: this.packageDimensionUnit,
        });
    }
    buildPackageWeight(input) {
        const weight = this.extractWeight(input.sku.PackedWeightKg ?? input.sku.WeightKg ?? input.sku.RealWeightKg) ??
            this.packageWeight ??
            1;
        return this.cleanPayload({
            value: this.formatNumber(weight),
            unit: this.packageWeightUnit,
        });
    }
    extractDimension(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
    }
    extractWeight(value) {
        if (value === undefined || value === null) {
            return undefined;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
    }
    formatPrice(price) {
        return Number(price || 0)
            .toFixed(2)
            .toString();
    }
    formatNumber(value) {
        return Number(value || 0)
            .toFixed(2)
            .toString();
    }
    cleanPayload(payload) {
        const clone = {};
        Object.entries(payload).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }
            if (Array.isArray(value)) {
                const cleaned = value
                    .map((item) => (typeof item === 'object' && item !== null ? this.cleanPayload(item) : item))
                    .filter((item) => item !== undefined && item !== null);
                if (cleaned.length > 0) {
                    clone[key] = cleaned;
                }
                return;
            }
            if (typeof value === 'object') {
                const cleaned = this.cleanPayload(value);
                if (Object.keys(cleaned).length > 0) {
                    clone[key] = cleaned;
                }
                return;
            }
            clone[key] = value;
        });
        return clone;
    }
};
exports.TiktokProductClient = TiktokProductClient;
exports.TiktokProductClient = TiktokProductClient = TiktokProductClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        tiktokshop_service_1.TiktokShopService,
        nestjs_pino_1.PinoLogger])
], TiktokProductClient);
//# sourceMappingURL=tiktok-product.client.js.map