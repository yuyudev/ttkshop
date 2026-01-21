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
exports.ZodValidationPipe = exports.tikTokCallbackQuerySchema = exports.tiktokWebhookSchema = exports.orderWebhookSchema = exports.inventorySyncSchema = exports.catalogSyncSchema = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
exports.catalogSyncSchema = zod_1.z.object({
    updatedFrom: zod_1.z.string().datetime().optional(),
});
exports.inventorySyncSchema = zod_1.z.object({
    skuIds: zod_1.z.array(zod_1.z.string()).optional(),
    warehouseId: zod_1.z.string().optional(),
});
exports.orderWebhookSchema = zod_1.z.object({
    type: zod_1.z.number(),
    shop_id: zod_1.z.string(),
    data: zod_1.z.object({
        order_id: zod_1.z.string(),
        order_status: zod_1.z.string().optional(),
    }).passthrough(),
    timestamp: zod_1.z.number().optional(),
}).passthrough();
exports.tiktokWebhookSchema = zod_1.z.object({
    type: zod_1.z.number(),
    shop_id: zod_1.z.string().optional(),
    data: zod_1.z.unknown().optional(),
    timestamp: zod_1.z.number().optional(),
}).passthrough();
exports.tikTokCallbackQuerySchema = zod_1.z
    .object({
    auth_code: zod_1.z.string().optional(),
    code: zod_1.z.string().optional(),
    shop_id: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
})
    .refine((payload) => payload.auth_code || payload.code, {
    message: 'Auth code is required',
    path: ['auth_code'],
});
let ZodValidationPipe = class ZodValidationPipe {
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new common_1.BadRequestException({
                message: 'Validation failed',
                issues: result.error.format(),
            });
        }
        return result.data;
    }
};
exports.ZodValidationPipe = ZodValidationPipe;
exports.ZodValidationPipe = ZodValidationPipe = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [zod_1.ZodSchema])
], ZodValidationPipe);
//# sourceMappingURL=dto.js.map