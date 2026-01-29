"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = exports.configSchema = void 0;
const zod_1 = require("zod");
exports.configSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : 3000))
        .refine((value) => Number.isFinite(value) && value > 0, {
        message: 'PORT must be a positive integer',
    }),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    TIKTOK_APP_KEY: zod_1.z.string().min(1, 'TIKTOK_APP_KEY is required'),
    TIKTOK_APP_SECRET: zod_1.z.string().min(1, 'TIKTOK_APP_SECRET is required'),
    TIKTOK_BASE_AUTH: zod_1.z.string().url('TIKTOK_BASE_AUTH must be a valid URL'),
    TIKTOK_BASE_OPEN: zod_1.z.string().url('TIKTOK_BASE_OPEN must be a valid URL'),
    TIKTOK_BASE_SERV: zod_1.z.string().url('TIKTOK_BASE_SERV must be a valid URL'),
    TIKTOK_CURRENCY: zod_1.z
        .string()
        .min(3)
        .default('BRL'),
    TIKTOK_SAVE_MODE: zod_1.z
        .string()
        .optional()
        .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'LISTING')),
    TIKTOK_PACKAGE_WEIGHT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
        message: 'TIKTOK_PACKAGE_WEIGHT must be a positive number when provided',
    }),
    TIKTOK_PACKAGE_WEIGHT_UNIT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'KILOGRAM')),
    TIKTOK_PACKAGE_LENGTH: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
        message: 'TIKTOK_PACKAGE_LENGTH must be a positive number when provided',
    }),
    TIKTOK_PACKAGE_WIDTH: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
        message: 'TIKTOK_PACKAGE_WIDTH must be a positive number when provided',
    }),
    TIKTOK_PACKAGE_HEIGHT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
        message: 'TIKTOK_PACKAGE_HEIGHT must be a positive number when provided',
    }),
    TIKTOK_PACKAGE_DIMENSION_UNIT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'CENTIMETER')),
    TIKTOK_DESCRIPTION_FALLBACK: zod_1.z
        .string()
        .optional()
        .transform((value) => value && value.trim().length > 0 ? value.trim() : 'No description provided.'),
    TIKTOK_MINIMUM_ORDER_QUANTITY: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
        message: 'TIKTOK_MINIMUM_ORDER_QUANTITY must be a positive number when provided',
    }),
    TIKTOK_LISTING_PLATFORMS: zod_1.z
        .string()
        .optional()
        .transform((value) => value && value.trim().length > 0
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined),
    PUBLIC_BASE_URL: zod_1.z.string().url('PUBLIC_BASE_URL must be a valid URL'),
    TTS_REDIRECT_PATH: zod_1.z.string().min(1, 'TTS_REDIRECT_PATH is required'),
    MIDDLEWARE_API_KEY: zod_1.z.string().min(1, 'MIDDLEWARE_API_KEY is required'),
    SWAGGER_USERNAME: zod_1.z.string().min(1, 'SWAGGER_USERNAME is required'),
    SWAGGER_PASSWORD: zod_1.z.string().min(1, 'SWAGGER_PASSWORD is required'),
    TOKEN_ENCRYPTION_KEY: zod_1.z
        .string()
        .min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters long for AES-256'),
    REQUEST_TIMEOUT_MS: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : 10000))
        .refine((value) => Number.isFinite(value) && value > 0, {
        message: 'REQUEST_TIMEOUT_MS must be a positive integer',
    }),
    HTTP_MAX_RETRIES: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : 3))
        .refine((value) => Number.isFinite(value) && value >= 0, {
        message: 'HTTP_MAX_RETRIES must be a non-negative integer',
    }),
    TTS_LABEL_TRIGGER: zod_1.z.enum(['immediate', 'invoice']).default('immediate'),
    VTEX_PAGE_SIZE: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 200), {
        message: 'VTEX_PAGE_SIZE must be between 1 and 200',
    }),
    VTEX_PAGE_LIMIT: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 1000), {
        message: 'VTEX_PAGE_LIMIT must be a positive integer',
    }),
    VTEX_FILE_PAGE_SIZE: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : undefined))
        .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 100), {
        message: 'VTEX_FILE_PAGE_SIZE must be between 1 and 100',
    }),
    VTEX_INVOICE_POLL_ENABLED: zod_1.z
        .string()
        .optional()
        .transform((value) => {
        if (value === undefined)
            return true;
        const normalized = value.trim().toLowerCase();
        if (normalized === '')
            return true;
        return !['0', 'false', 'no', 'off'].includes(normalized);
    }),
    VTEX_INVOICE_POLL_BATCH: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : 50))
        .refine((value) => Number.isFinite(value) && value > 0 && value <= 500, {
        message: 'VTEX_INVOICE_POLL_BATCH must be between 1 and 500',
    }),
    VTEX_INVOICE_POLL_MAX_AGE_DAYS: zod_1.z
        .string()
        .optional()
        .transform((value) => (value ? Number(value) : 30))
        .refine((value) => Number.isFinite(value) && value > 0 && value <= 365, {
        message: 'VTEX_INVOICE_POLL_MAX_AGE_DAYS must be between 1 and 365',
    }),
});
const validateConfig = (config) => {
    const parsed = exports.configSchema.safeParse(config);
    if (!parsed.success) {
        const flattened = parsed.error.flatten((issue) => issue.message);
        const details = Object.entries(flattened.fieldErrors)
            .map(([key, errors]) => `${key}: ${errors?.join(', ')}`)
            .join('; ');
        throw new Error(`Invalid environment configuration - ${details}`);
    }
    return parsed.data;
};
exports.validateConfig = validateConfig;
//# sourceMappingURL=config.js.map