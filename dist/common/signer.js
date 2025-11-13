"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTikTokSignature = createTikTokSignature;
exports.buildSignedQuery = buildSignedQuery;
const crypto = require("crypto");
function createTikTokSignature(secret, path, params, body) {
    const keys = Object.keys(params).filter((key) => key !== 'sign' && key !== 'access_token');
    keys.sort((a, b) => a.localeCompare(b));
    let concatenated = '';
    for (const key of keys) {
        const value = params[key];
        if (value !== undefined && value !== null) {
            concatenated += `${key}${value}`;
        }
    }
    let stringToSign = path + concatenated;
    if (body && Object.keys(body).length > 0) {
        stringToSign += JSON.stringify(body);
    }
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(stringToSign, 'utf8');
    return hmac.digest('hex');
}
function buildSignedQuery(appKey, secret, path, params = {}, body) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsForSignature = {
        app_key: appKey,
        sign_method: 'HmacSHA256',
        timestamp,
        ...params,
    };
    const sign = createTikTokSignature(secret, path, paramsForSignature, body);
    const query = new URLSearchParams();
    Object.entries({ ...paramsForSignature, sign }).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
            query.append(k, String(v));
        }
    });
    return query;
}
//# sourceMappingURL=signer.js.map