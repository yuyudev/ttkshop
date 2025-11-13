"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTikTokSign = generateTikTokSign;
exports.buildSignedRequest = buildSignedRequest;
const crypto = require("crypto");
const EXCLUDE_KEYS = ['access_token', 'sign'];
function generateTikTokSign(requestOption, appSecret) {
    let signString = '';
    const params = requestOption.qs || {};
    const sortedParams = Object.keys(params)
        .filter((key) => !EXCLUDE_KEYS.includes(key))
        .sort()
        .map((key) => ({ key, value: params[key] }));
    const paramString = sortedParams
        .map(({ key, value }) => `${key}${value}`)
        .join('');
    const pathname = new URL(requestOption.uri).pathname;
    signString = `${pathname}${paramString}`;
    const contentTypeHeader = requestOption.headers?.['content-type'] ??
        requestOption.headers?.['Content-Type'];
    const isMultipart = contentTypeHeader &&
        contentTypeHeader.toLowerCase().startsWith('multipart/form-data');
    if (!isMultipart && requestOption.body && Object.keys(requestOption.body).length) {
        const body = JSON.stringify(requestOption.body);
        signString += body;
    }
    signString = `${appSecret}${signString}${appSecret}`;
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(signString);
    return hmac.digest('hex');
}
function buildSignedRequest(baseOpenUrl, path, appKey, appSecret, options) {
    const uri = `${baseOpenUrl}${path}`;
    const qs = {
        app_key: appKey,
        timestamp: Math.floor(Date.now() / 1000),
        ...(options.qs ?? {}),
    };
    const headers = {
        ...(options.headers ?? {}),
    };
    const requestOption = {
        uri,
        qs,
        headers,
        body: options.body,
    };
    const sign = generateTikTokSign(requestOption, appSecret);
    qs.sign = sign;
    const search = new URLSearchParams();
    Object.entries(qs).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
            search.append(k, String(v));
        }
    });
    return {
        url: `${uri}?${search.toString()}`,
        headers,
        body: options.body,
    };
}
//# sourceMappingURL=signer.js.map