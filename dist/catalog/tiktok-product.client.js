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
const FormData = require("form-data");
const shop_config_service_1 = require("../common/shop-config.service");
let TiktokProductClient = TiktokProductClient_1 = class TiktokProductClient {
    constructor(http, configService, tiktokShopService, shopConfigService, logger) {
        this.http = http;
        this.configService = configService;
        this.tiktokShopService = tiktokShopService;
        this.shopConfigService = shopConfigService;
        this.logger = logger;
        this.imageUriCache = new Map();
        this.openBase = this.normalizeBaseUrl(this.configService.getOrThrow('TIKTOK_BASE_OPEN', { infer: true }));
        this.appKey = this.configService.getOrThrow('TIKTOK_APP_KEY', { infer: true });
        this.appSecret = this.configService.getOrThrow('TIKTOK_APP_SECRET', { infer: true });
        this.currency = this.configService.get('TIKTOK_CURRENCY', { infer: true }) ?? 'BRL';
        this.saveMode =
            this.configService.get('TIKTOK_SAVE_MODE', { infer: true }) ?? 'LISTING';
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
    async createProduct(shopId, input, options = {}) {
        return this.withTokenRetry(shopId, async (accessToken) => {
            const shopConfig = await this.shopConfigService.getTiktokCatalogConfig(shopId);
            const payload = await this.buildProductPayload(shopId, accessToken, input, options, shopConfig);
            this.logger.info({
                shopId,
                vtexProductId: input.product.Id,
                skuCount: input.skus.length,
            }, 'Creating product on TikTok');
            const { url, headers, body } = this.buildSignedOpenApiRequest('/product/202309/products', accessToken, payload, {
                shopCipher: shopConfig.shopCipher,
                shopId,
            });
            const response = await (0, rxjs_1.firstValueFrom)(this.http.post(url, body, { headers }));
            const parsed = this.parseProductResponse(response.data);
            const code = response.data?.code;
            const message = response.data?.message;
            if (code !== undefined && code !== 0) {
                throw this.buildTikTokError('createProduct', code, message, response.data);
            }
            if (!parsed.productId || !Object.keys(parsed.skuIds).length) {
                throw new Error(`TikTok createProduct did not return product_id/sku_id for vtexProductId=${input.product.Id}`);
            }
            this.logger.info({
                shopId,
                ttsProductId: parsed.productId,
                skuCount: Object.keys(parsed.skuIds).length,
            }, 'Successfully created TikTok product');
            return parsed;
        });
    }
    async updateProduct(shopId, productId, input, options = {}) {
        return this.withTokenRetry(shopId, async (accessToken) => {
            const shopConfig = await this.shopConfigService.getTiktokCatalogConfig(shopId);
            const payload = await this.buildProductPayload(shopId, accessToken, input, {
                ...options,
                productId,
            }, shopConfig);
            this.logger.info({
                shopId,
                productId,
                vtexProductId: input.product.Id,
                skuCount: input.skus.length,
            }, 'Updating product on TikTok');
            const { url, headers, body } = this.buildSignedOpenApiRequest(`/product/202309/products/${productId}`, accessToken, payload, {
                shopCipher: shopConfig.shopCipher,
                shopId,
            });
            const response = await (0, rxjs_1.firstValueFrom)(this.http.put(url, body, { headers }));
            const parsed = this.parseProductResponse(response.data);
            const code = response.data?.code;
            const message = response.data?.message;
            if (code !== undefined && code !== 0) {
                throw this.buildTikTokError('updateProduct', code, message, response.data);
            }
            if (!parsed.productId || !Object.keys(parsed.skuIds).length) {
                this.logger.warn({
                    shopId,
                    productId,
                    vtexProductId: input.product.Id,
                    raw: response.data,
                }, 'TikTok updateProduct did not return product_id/sku_id, keeping existing mapping');
            }
            else {
                this.logger.info({
                    shopId,
                    ttsProductId: parsed.productId,
                    skuCount: Object.keys(parsed.skuIds).length,
                }, 'Successfully updated TikTok product');
            }
            return parsed;
        });
    }
    async updateStock(shopId, _warehouseId, ttsSkuId, availableQuantity, ttsProductId) {
        await this.withTokenRetry(shopId, async (accessToken) => {
            const shopConfig = await this.shopConfigService.getTiktokInventoryConfig(shopId);
            const inventoryItem = {
                warehouse_id: shopConfig.warehouseId,
                quantity: Math.max(0, Math.floor(availableQuantity)),
            };
            const body = {
                skus: [
                    {
                        id: String(ttsSkuId),
                        inventory: [inventoryItem],
                    },
                ],
            };
            const { url, headers, body: signedBody } = this.buildSignedOpenApiRequest(`/product/202309/products/${ttsProductId}/inventory/update`, accessToken, body, {
                shopCipher: shopConfig.shopCipher,
                shopId,
            });
            const response = await (0, rxjs_1.firstValueFrom)(this.http.post(url, signedBody, { headers }));
            const code = response.data?.code;
            if (code !== undefined && code !== 0) {
                const message = response.data?.message ?? 'Unknown';
                throw new Error(`TikTok inventory update failed: code=${code} message=${message}`);
            }
        });
    }
    buildSignedOpenApiRequest(path, accessToken, body, options = {}) {
        const headers = {
            'content-type': 'application/json',
            Accept: 'application/json',
            'x-tts-access-token': accessToken,
            Authorization: `Bearer ${accessToken}`,
        };
        const qs = {
            ...(options.extraParams ?? {}),
        };
        if (options.includeShopCipher !== false && options.shopCipher) {
            qs.shop_cipher = options.shopCipher;
        }
        if (options.includeShopId !== false && options.shopId) {
            qs.shop_id = options.shopId;
        }
        return (0, signer_1.buildSignedRequest)(this.openBase, path, this.appKey, this.appSecret, {
            qs,
            headers,
            body,
        });
    }
    buildAccessHeaders(accessToken) {
        return {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-tts-access-token': accessToken,
            Authorization: `Bearer ${accessToken}`,
        };
    }
    normalizeBaseUrl(url) {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
    parseProductResponse(data) {
        const code = data?.code;
        const message = data?.message;
        const productId = data?.data?.product_id ??
            data?.product_id ??
            null;
        const skuNodes = (Array.isArray(data?.data?.skus) && data.data.skus) ??
            (Array.isArray(data?.skus) && data.skus) ??
            [];
        const skuIds = {};
        if (Array.isArray(skuNodes)) {
            for (const sku of skuNodes) {
                const sellerSku = sku?.seller_sku ??
                    sku?.sellerSku ??
                    sku?.external_sku_id ??
                    sku?.externalSkuId ??
                    sku?.seller_id;
                const skuIdValue = sku?.id ?? sku?.sku_id ?? sku?.skuId;
                if (sellerSku && skuIdValue) {
                    skuIds[String(sellerSku)] = String(skuIdValue);
                }
            }
        }
        if (!Object.keys(skuIds).length) {
            const fallbackSkuId = data?.data?.sku_id ??
                data?.sku_id ??
                null;
            const fallbackSellerSku = (Array.isArray(data?.data?.skus) && data?.data?.skus?.[0]?.seller_sku) ??
                data?.data?.seller_sku ??
                data?.seller_sku ??
                null;
            if (fallbackSkuId && fallbackSellerSku) {
                skuIds[String(fallbackSellerSku)] = String(fallbackSkuId);
            }
        }
        if (code !== undefined && code !== 0) {
            this.logger.error({ code, message, raw: data }, 'TikTok product API returned non-zero code');
        }
        else if (!productId || !Object.keys(skuIds).length) {
            this.logger.warn({ raw: data }, 'TikTok product API did not return product_id / sku ids');
        }
        return {
            productId,
            skuIds,
            raw: data,
        };
    }
    buildTikTokError(action, code, message, raw) {
        const normalizedCode = code ?? -1;
        const normalizedMessage = message ?? 'Unknown';
        const error = new Error(`TikTok ${action} failed: code=${normalizedCode} message=${normalizedMessage}`);
        error.code = normalizedCode;
        if (raw !== undefined) {
            error.raw = raw;
        }
        return error;
    }
    isExpiredError(err) {
        const status = err?.response?.status;
        const code = err?.response?.data?.code;
        const message = err?.response?.data?.message;
        return status === 401 || code === 105002 || message?.toString?.().includes('Expired credentials');
    }
    async withTokenRetry(shopId, fn) {
        let token = await this.tiktokShopService.getAccessToken(shopId);
        try {
            return await fn(token);
        }
        catch (err) {
            if (!this.isExpiredError(err)) {
                throw err;
            }
            this.logger.warn({ shopId }, 'Access token expired, refreshing and retrying');
            token = await this.tiktokShopService.refresh(shopId);
            return fn(token);
        }
    }
    async uploadImageWithToken(normalizedUrl, accessToken) {
        let imageResponse;
        try {
            imageResponse = await (0, rxjs_1.firstValueFrom)(this.http.get(normalizedUrl, {
                responseType: 'arraybuffer',
            }));
        }
        catch (err) {
            err.__stage = 'download';
            err.__url = normalizedUrl;
            throw err;
        }
        const buffer = Buffer.from(imageResponse.data);
        const form = new FormData();
        const filename = normalizedUrl.split('/').pop() || `image-${Date.now()}.jpg`;
        form.append('data', buffer, {
            filename,
            contentType: 'image/jpeg',
        });
        form.append('use_case', 'MAIN_IMAGE');
        const formHeaders = form.getHeaders();
        const { url, headers } = (0, signer_1.buildSignedRequest)(this.openBase, '/product/202309/images/upload', this.appKey, this.appSecret, {
            qs: {},
            headers: {
                ...formHeaders,
                'x-tts-access-token': accessToken,
                Authorization: `Bearer ${accessToken}`,
            },
            body: undefined,
        });
        let response;
        try {
            response = await (0, rxjs_1.firstValueFrom)(this.http.post(url, form, { headers }));
        }
        catch (err) {
            err.__stage = 'upload';
            err.__url = url;
            throw err;
        }
        const uri = response.data?.data?.uri ??
            response.data?.data?.image?.uri ??
            response.data?.uri ??
            null;
        if (!uri) {
            throw new Error('TikTok image upload did not return a URI');
        }
        this.imageUriCache.set(normalizedUrl, uri);
        this.logger.info({ imageUrl: normalizedUrl, uri }, 'Successfully uploaded image to TikTok');
        return uri;
    }
    buildSellerSku(skuInput) {
        const override = typeof skuInput.sellerSkuOverride === 'string'
            ? skuInput.sellerSkuOverride.trim()
            : '';
        const fallback = String(skuInput.vtexSkuId);
        if (override) {
            return override;
        }
        return fallback;
    }
    buildExternalSkuId(skuInput, suffix) {
        const baseRaw = skuInput.sku.RefId ??
            skuInput.sku.refId ??
            skuInput.vtexSkuId ??
            null;
        if (baseRaw === null || baseRaw === undefined) {
            return undefined;
        }
        const base = String(baseRaw).trim();
        if (!base) {
            return undefined;
        }
        return suffix ? `${base}-${suffix}` : base;
    }
    buildIdempotencyKey(shopId, productId, suffix) {
        const base = `vtex-${shopId}-product-${productId}`;
        return suffix ? `${base}-${suffix}` : base;
    }
    async buildProductPayload(shopId, accessToken, input, options = {}, shopConfig) {
        if (!input.skus.length) {
            throw new Error('Cannot build TikTok product payload without SKUs');
        }
        const primarySku = input.skus[0];
        const brandId = shopConfig.brandId ?? (input.product.BrandId ? String(input.product.BrandId) : undefined);
        const brandName = shopConfig.brandName ??
            input.product.BrandName ??
            primarySku.sku.BrandName ??
            'Generic';
        const categoryId = options.categoryId ??
            shopConfig.defaultCategoryId ??
            (input.product.CategoryId ? String(input.product.CategoryId) : undefined);
        if (!categoryId) {
            throw new Error('Unable to determine TikTok category_id for product');
        }
        const mainImageUris = new Map();
        const skuPayloads = [];
        const usedSaleAttributeValues = new Set();
        const saleAttributeCounters = new Map();
        for (const skuInput of input.skus) {
            const priceAmount = this.formatPrice(skuInput.price);
            const quantity = Math.max(0, Number.isFinite(skuInput.quantity) ? skuInput.quantity : 0);
            const inventory = [
                {
                    warehouse_id: shopConfig.warehouseId,
                    quantity: Math.floor(quantity),
                },
            ];
            const identifierCode = this.buildIdentifierCode(skuInput.sku);
            const preparedImages = await this.prepareImages(shopId, skuInput.images);
            for (const image of preparedImages) {
                if (!mainImageUris.has(image.uri)) {
                    mainImageUris.set(image.uri, { uri: image.uri });
                }
            }
            const skuImgUri = preparedImages[0]?.uri;
            const supplementarySkuImages = preparedImages.slice(1);
            let salesAttributes = this.buildSalesAttributesForSku(input.product, skuInput);
            if (salesAttributes && salesAttributes.length > 0) {
                for (const attr of salesAttributes) {
                    let name = String(attr.name ?? '').trim();
                    let value = String(attr.value_name ?? '').trim();
                    if (!name || !value) {
                        salesAttributes = [];
                        break;
                    }
                    const baseKey = `${name}:${value}`;
                    if (usedSaleAttributeValues.has(baseKey)) {
                        const currentCount = saleAttributeCounters.get(baseKey) ?? 1;
                        const nextCount = currentCount + 1;
                        saleAttributeCounters.set(baseKey, nextCount);
                        value = `${value}-${nextCount}`;
                    }
                    else {
                        saleAttributeCounters.set(baseKey, 1);
                    }
                    const finalKey = `${name}:${value}`;
                    usedSaleAttributeValues.add(finalKey);
                    attr.name = name;
                    attr.value_name = value;
                }
            }
            const externalSkuId = this.buildExternalSkuId(skuInput, options.externalSkuIdSuffix);
            const sellerSku = this.buildSellerSku(skuInput);
            const skuPayload = {
                seller_sku: sellerSku,
                price: {
                    amount: priceAmount,
                    currency: this.currency,
                    sale_price: priceAmount,
                },
                inventory,
                identifier_code: identifierCode,
                sku_img: skuImgUri ? { uri: skuImgUri } : undefined,
                supplementary_sku_images: supplementarySkuImages.length > 0
                    ? supplementarySkuImages.map((image) => ({ uri: image.uri }))
                    : undefined,
                sales_attributes: salesAttributes,
                sku_unit_count: this.buildSkuUnitCount(skuInput.sku),
            };
            if (externalSkuId) {
                skuPayload.external_sku_id = externalSkuId;
            }
            if (options.productId && skuInput.ttsSkuId) {
                skuPayload.id = String(skuInput.ttsSkuId);
                skuPayload.sku_id = String(skuInput.ttsSkuId);
            }
            skuPayloads.push(this.cleanPayload(skuPayload));
        }
        const description = this.buildDescription(input.product, primarySku);
        const payload = {
            save_mode: this.saveMode,
            title: this.buildTitle(input.product, primarySku),
            description,
            category_id: categoryId,
            brand_id: brandId,
            brand_name: brandName,
            main_images: Array.from(mainImageUris.values()),
            skus: skuPayloads,
            product_attributes: this.buildProductAttributes(input),
            package_dimensions: this.buildPackageDimensions(primarySku.sku),
            package_weight: this.buildPackageWeight(primarySku.sku),
            is_cod_allowed: false,
            is_pre_owned: false,
            idempotency_key: this.buildIdempotencyKey(shopId, input.product.Id, options.idempotencyKeySuffix),
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
    async prepareImages(shopId, images) {
        if (!images.length)
            return [];
        const uris = [];
        for (const image of [...images].sort((a, b) => a.position - b.position)) {
            const downloadUrls = [image.url, image.url.split('?')[0]];
            let uploadedUri = null;
            for (const url of downloadUrls) {
                uploadedUri = await this.ensureImageUri(shopId, url);
                if (uploadedUri)
                    break;
            }
            if (uploadedUri)
                uris.push(uploadedUri);
        }
        if (uris.length === 0) {
            this.logger.warn({ images }, 'Nenhuma imagem foi carregada; usando placeholder');
            return [];
        }
        return uris.map((uri) => ({ uri }));
    }
    async ensureImageUri(shopId, imageUrl) {
        const normalized = imageUrl?.trim();
        if (!normalized) {
            return null;
        }
        if (this.imageUriCache.has(normalized)) {
            return this.imageUriCache.get(normalized) ?? null;
        }
        try {
            const uri = await this.withTokenRetry(shopId, (token) => this.uploadImageWithToken(normalized, token));
            return uri;
        }
        catch (error) {
            const response = error?.response;
            const errorPayload = response?.data;
            const meta = {
                stage: error?.__stage,
                url: error?.__url ?? response?.config?.url,
                method: response?.config?.method,
                status: response?.status,
                statusText: response?.statusText,
            };
            this.logger.error({ err: error, errorPayload, imageUrl: normalized, meta }, 'Failed to upload image to TikTok');
            return null;
        }
    }
    buildDescription(product, primarySku) {
        const description = product.Description ??
            product.MetaTagDescription ??
            primarySku.sku?.Description ??
            this.fallbackDescription;
        return description.toString().trim() || this.fallbackDescription;
    }
    buildTitle(product, primarySku) {
        const candidates = [];
        if (product.Name)
            candidates.push(product.Name.toString());
        if (product.Title)
            candidates.push(product.Title.toString());
        const skuName = primarySku.sku.Name ??
            primarySku.sku.name ??
            primarySku.sku?.NameComplete;
        if (skuName)
            candidates.push(skuName.toString());
        let title = candidates.find((c) => c && c.trim().length > 0)?.trim() ??
            `SKU ${primarySku.vtexSkuId}`;
        const brand = product.BrandName ??
            primarySku.sku.BrandName ??
            primarySku.sku?.brandName;
        if (title.length < 25 && brand) {
            if (!title.toLowerCase().includes(brand.toLowerCase())) {
                title = `${brand} - ${title}`;
            }
        }
        if (title.length < 25) {
            title = `${title}`;
        }
        if (title.length > 255) {
            title = title.substring(0, 255);
        }
        return title;
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
    buildSalesAttributesForSku(product, skuInput) {
        const rawSizeLabel = this.extractSizeLabel(product, skuInput) ?? skuInput.sizeLabel;
        const sizeLabel = rawSizeLabel
            ? rawSizeLabel.toString().trim()
            : undefined;
        if (!sizeLabel) {
            return [];
        }
        return [
            this.cleanPayload({
                name: 'Size',
                value_name: sizeLabel,
            }),
        ];
    }
    buildProductAttributes(_input) {
        return [];
    }
    buildPackageDimensions(sku) {
        const fallbackLength = this.packageLength ?? 10;
        const fallbackWidth = this.packageWidth ?? 10;
        const fallbackHeight = this.packageHeight ?? 10;
        const length = this.extractDimension(sku.PackedLength ?? sku.Length) ?? fallbackLength;
        const width = this.extractDimension(sku.PackedWidth ?? sku.Width) ?? fallbackWidth;
        const height = this.extractDimension(sku.PackedHeight ?? sku.Height) ?? fallbackHeight;
        return this.cleanPayload({
            length: this.formatNumber(length),
            width: this.formatNumber(width),
            height: this.formatNumber(height),
            unit: this.packageDimensionUnit,
        });
    }
    buildPackageWeight(sku) {
        const weight = this.extractWeight(sku.PackedWeightKg ?? sku.WeightKg ?? sku.RealWeightKg) ??
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
                    .map((item) => typeof item === 'object' && item !== null
                    ? this.cleanPayload(item)
                    : item)
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
    extractSizeLabel(product, skuInput) {
        if (skuInput.sizeLabel) {
            const normalized = skuInput.sizeLabel.toString().trim();
            return normalized ? normalized.toUpperCase() : undefined;
        }
        const productName = product.Name?.toString().trim().toLowerCase() ?? '';
        const rawSkuName = skuInput.sku.Name ??
            skuInput.sku.name ??
            skuInput.sku?.NameComplete ??
            '';
        const skuName = rawSkuName ? rawSkuName.toString().trim() : '';
        let candidate = skuName;
        if (productName && skuName.toLowerCase().startsWith(productName)) {
            candidate = skuName.slice(productName.length).trim();
        }
        const fromCandidate = this.extractSizeToken(candidate) ?? this.extractSizeToken(skuName);
        if (fromCandidate) {
            return fromCandidate;
        }
        const refId = skuInput.sku?.RefId ?? skuInput.sku.refId;
        if (typeof refId === 'string') {
            const fromRef = this.extractSizeToken(refId);
            if (fromRef) {
                return fromRef;
            }
        }
        return undefined;
    }
    extractSizeToken(value) {
        const normalized = value.toString().trim().toUpperCase();
        if (!normalized) {
            return undefined;
        }
        const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
        for (let i = tokens.length - 1; i >= 0; i -= 1) {
            const token = tokens[i];
            if (this.isSizeToken(token)) {
                return token;
            }
        }
        const suffixMatch = normalized.match(/(PP|GG|EG|XG|XXG|XGG|P|M|G|\d{1,3})$/);
        if (suffixMatch) {
            return suffixMatch[1];
        }
        return undefined;
    }
    isSizeToken(token) {
        if (/^\d{1,3}$/.test(token)) {
            return true;
        }
        return ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG', 'XXG', 'XGG'].includes(token);
    }
};
exports.TiktokProductClient = TiktokProductClient;
exports.TiktokProductClient = TiktokProductClient = TiktokProductClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        tiktokshop_service_1.TiktokShopService,
        shop_config_service_1.ShopConfigService,
        nestjs_pino_1.PinoLogger])
], TiktokProductClient);
//# sourceMappingURL=tiktok-product.client.js.map