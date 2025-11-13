"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSignedQuery = exports.createTikTokSignature = void 0;
const crypto_1 = require("crypto");
const createTikTokSignature = (secret, path, params) => {
    const filtered = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
        .sort(([a], [b]) => (a > b ? 1 : -1));
    const query = filtered.map(([key, value]) => `${key}${value}`).join('');
    const payload = `${path}${query}`;
    const digest = (0, crypto_1.createHmac)('sha256', secret).update(payload).digest('hex');
    return digest;
};
exports.createTikTokSignature = createTikTokSignature;
const buildSignedQuery = (appKey, secret, path, params) => {
    const baseParams = {
        app_key: appKey,
        sign: '',
        sign_method: 'HmacSHA256',
        timestamp: Math.floor(Date.now() / 1000),
        ...params,
    };
    const sign = (0, exports.createTikTokSignature)(secret, path, baseParams);
    const query = new URLSearchParams();
    Object.entries({ ...baseParams, sign }).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            query.append(key, String(value));
        }
    });
    return query;
};
exports.buildSignedQuery = buildSignedQuery;
//# sourceMappingURL=signer.js.map