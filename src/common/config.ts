import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 3000))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'PORT must be a positive integer',
    }),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TIKTOK_APP_KEY: z.string().min(1, 'TIKTOK_APP_KEY is required'),
  TIKTOK_APP_SECRET: z.string().min(1, 'TIKTOK_APP_SECRET is required'),
  TIKTOK_BASE_AUTH: z.string().url('TIKTOK_BASE_AUTH must be a valid URL'),
  TIKTOK_BASE_OPEN: z.string().url('TIKTOK_BASE_OPEN must be a valid URL'),
  TIKTOK_BASE_SERV: z.string().url('TIKTOK_BASE_SERV must be a valid URL'),
  TIKTOK_SHOP_CIPHER: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_SHOP_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_DEFAULT_CATEGORY_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_BRAND_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_BRAND_NAME: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_WAREHOUSE_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  TIKTOK_CURRENCY: z
    .string()
    .min(3)
    .default('BRL'),
  TIKTOK_SAVE_MODE: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'LISTING')),
  TIKTOK_PACKAGE_WEIGHT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'TIKTOK_PACKAGE_WEIGHT must be a positive number when provided',
    }),
  TIKTOK_PACKAGE_WEIGHT_UNIT: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'KILOGRAM')),
  TIKTOK_PACKAGE_LENGTH: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'TIKTOK_PACKAGE_LENGTH must be a positive number when provided',
    }),
  TIKTOK_PACKAGE_WIDTH: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'TIKTOK_PACKAGE_WIDTH must be a positive number when provided',
    }),
  TIKTOK_PACKAGE_HEIGHT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'TIKTOK_PACKAGE_HEIGHT must be a positive number when provided',
    }),
  TIKTOK_PACKAGE_DIMENSION_UNIT: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : 'CENTIMETER')),
  TIKTOK_DESCRIPTION_FALLBACK: z
    .string()
    .optional()
    .transform((value) =>
      value && value.trim().length > 0 ? value.trim() : 'No description provided.',
    ),
  TIKTOK_MINIMUM_ORDER_QUANTITY: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'TIKTOK_MINIMUM_ORDER_QUANTITY must be a positive number when provided',
    }),
  TIKTOK_LISTING_PLATFORMS: z
    .string()
    .optional()
    .transform((value) =>
      value && value.trim().length > 0
        ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
        : undefined,
    ),
  VTEX_ACCOUNT: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_ENVIRONMENT: z.string().optional().default('vtexcommercestable'),
  VTEX_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_APP_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_APP_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_AFFILIATE_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_MARKETPLACE_SERVICES_ENDPOINT: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_PAYMENT_SYSTEM_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_PAYMENT_SYSTEM_NAME: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_PAYMENT_GROUP: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_PAYMENT_MERCHANT: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_WAREHOUSE_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_WEBHOOK_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_SALES_CHANNEL: z.string().optional().default('1'),
  PUBLIC_BASE_URL: z.string().url('PUBLIC_BASE_URL must be a valid URL'),
  TTS_REDIRECT_PATH: z.string().min(1, 'TTS_REDIRECT_PATH is required'),
  MIDDLEWARE_API_KEY: z.string().min(1, 'MIDDLEWARE_API_KEY is required'),
  SWAGGER_USERNAME: z.string().min(1, 'SWAGGER_USERNAME is required'),
  SWAGGER_PASSWORD: z.string().min(1, 'SWAGGER_PASSWORD is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters long for AES-256'),
  REQUEST_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 10000))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'REQUEST_TIMEOUT_MS must be a positive integer',
    }),
  HTTP_MAX_RETRIES: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 3))
    .refine((value) => Number.isFinite(value) && value >= 0, {
      message: 'HTTP_MAX_RETRIES must be a non-negative integer',
    }),
  VTEX_PRICING_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  VTEX_PAGE_SIZE: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 200), {
      message: 'VTEX_PAGE_SIZE must be between 1 and 200',
    }),
  VTEX_PAGE_LIMIT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 1000), {
      message: 'VTEX_PAGE_LIMIT must be a positive integer',
    }),
  VTEX_FILE_PAGE_SIZE: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 100), {
      message: 'VTEX_FILE_PAGE_SIZE must be between 1 and 100',
    }),
});

export type AppConfig = z.infer<typeof configSchema>;

export const validateConfig = (config: Record<string, unknown>): AppConfig => {
  const parsed = configSchema.safeParse(config);

  if (!parsed.success) {
    const flattened = parsed.error.flatten((issue) => issue.message);
    const details = Object.entries(flattened.fieldErrors)
      .map(([key, errors]) => `${key}: ${errors?.join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration - ${details}`);
  }

  return parsed.data;
};
