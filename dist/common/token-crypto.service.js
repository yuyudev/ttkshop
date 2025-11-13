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
exports.TokenCryptoService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let TokenCryptoService = class TokenCryptoService {
    constructor(configService) {
        this.configService = configService;
        const secret = this.configService.getOrThrow('TOKEN_ENCRYPTION_KEY', { infer: true });
        this.key = (0, crypto_1.createHash)('sha256').update(secret).digest();
    }
    encrypt(value) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    }
    decrypt(payload) {
        const buffer = Buffer.from(payload, 'base64');
        const iv = buffer.subarray(0, 12);
        const authTag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }
};
exports.TokenCryptoService = TokenCryptoService;
exports.TokenCryptoService = TokenCryptoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TokenCryptoService);
//# sourceMappingURL=token-crypto.service.js.map