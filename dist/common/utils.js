"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRequestId = exports.clamp = exports.createPayloadHash = exports.exponentialBackoff = exports.sleep = void 0;
const crypto_1 = require("crypto");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
const exponentialBackoff = (attempt, base = 250, max = 2000) => {
    if (attempt <= 0)
        return base;
    return Math.min(base * 2 ** (attempt - 1), max);
};
exports.exponentialBackoff = exponentialBackoff;
const createPayloadHash = (payload) => {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return (0, crypto_1.createHash)('sha256').update(serialized).digest('hex');
};
exports.createPayloadHash = createPayloadHash;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
exports.clamp = clamp;
const generateRequestId = () => (0, crypto_1.randomUUID)();
exports.generateRequestId = generateRequestId;
//# sourceMappingURL=utils.js.map