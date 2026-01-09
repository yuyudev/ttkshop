export const ensureTestEnv = () => {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.PORT = process.env.PORT ?? '3000';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db';
  process.env.TIKTOK_APP_KEY = process.env.TIKTOK_APP_KEY ?? 'app_key';
  process.env.TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET ?? 'secret';
  process.env.TIKTOK_BASE_AUTH =
    process.env.TIKTOK_BASE_AUTH ?? 'https://auth.tiktok-shops.com';
  process.env.TIKTOK_BASE_OPEN =
    process.env.TIKTOK_BASE_OPEN ?? 'https://open-api.tiktokglobalshop.com';
  process.env.TIKTOK_BASE_SERV =
    process.env.TIKTOK_BASE_SERV ?? 'https://services.tiktokshop.com';
  process.env.TIKTOK_SHOP_CIPHER = process.env.TIKTOK_SHOP_CIPHER ?? 'cipher';
  process.env.TIKTOK_SHOP_ID = process.env.TIKTOK_SHOP_ID ?? 'shop-id';
  process.env.TIKTOK_DEFAULT_CATEGORY_ID =
    process.env.TIKTOK_DEFAULT_CATEGORY_ID ?? '600001';
  process.env.TIKTOK_BRAND_ID = process.env.TIKTOK_BRAND_ID ?? '';
  process.env.TIKTOK_BRAND_NAME = process.env.TIKTOK_BRAND_NAME ?? 'TestBrand';
  process.env.TIKTOK_WAREHOUSE_ID = process.env.TIKTOK_WAREHOUSE_ID ?? 'warehouse-1';
  process.env.TIKTOK_CURRENCY = process.env.TIKTOK_CURRENCY ?? 'BRL';
  process.env.TIKTOK_SAVE_MODE = process.env.TIKTOK_SAVE_MODE ?? 'LISTING';
  process.env.TIKTOK_PACKAGE_WEIGHT = process.env.TIKTOK_PACKAGE_WEIGHT ?? '1.2';
  process.env.TIKTOK_PACKAGE_WEIGHT_UNIT =
    process.env.TIKTOK_PACKAGE_WEIGHT_UNIT ?? 'KILOGRAM';
  process.env.TIKTOK_PACKAGE_LENGTH = process.env.TIKTOK_PACKAGE_LENGTH ?? '10';
  process.env.TIKTOK_PACKAGE_WIDTH = process.env.TIKTOK_PACKAGE_WIDTH ?? '10';
  process.env.TIKTOK_PACKAGE_HEIGHT = process.env.TIKTOK_PACKAGE_HEIGHT ?? '10';
  process.env.TIKTOK_PACKAGE_DIMENSION_UNIT =
    process.env.TIKTOK_PACKAGE_DIMENSION_UNIT ?? 'CENTIMETER';
  process.env.TIKTOK_DESCRIPTION_FALLBACK =
    process.env.TIKTOK_DESCRIPTION_FALLBACK ?? 'Descrição indisponível.';
  process.env.TIKTOK_MINIMUM_ORDER_QUANTITY =
    process.env.TIKTOK_MINIMUM_ORDER_QUANTITY ?? '1';
  process.env.TIKTOK_LISTING_PLATFORMS =
    process.env.TIKTOK_LISTING_PLATFORMS ?? 'TIKTOK_SHOP';
  process.env.VTEX_ACCOUNT = process.env.VTEX_ACCOUNT ?? 'account';
  process.env.VTEX_ENVIRONMENT = process.env.VTEX_ENVIRONMENT ?? 'vtexcommercestable';
  process.env.VTEX_APP_KEY = process.env.VTEX_APP_KEY ?? 'key';
  process.env.VTEX_APP_TOKEN = process.env.VTEX_APP_TOKEN ?? 'token';
  process.env.PUBLIC_BASE_URL =
    process.env.PUBLIC_BASE_URL ?? 'https://tts.scoremedia.com.br';
  process.env.TTS_REDIRECT_PATH =
    process.env.TTS_REDIRECT_PATH ?? '/oauth/tiktokshop/callback';
  process.env.MIDDLEWARE_API_KEY = process.env.MIDDLEWARE_API_KEY ?? 'internal-key';
  process.env.SWAGGER_USERNAME = process.env.SWAGGER_USERNAME ?? 'admin';
  process.env.SWAGGER_PASSWORD = process.env.SWAGGER_PASSWORD ?? 'strongpass';
  process.env.TOKEN_ENCRYPTION_KEY =
    process.env.TOKEN_ENCRYPTION_KEY ?? '12345678901234567890123456789012';
  process.env.REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS ?? '2000';
  process.env.HTTP_MAX_RETRIES = process.env.HTTP_MAX_RETRIES ?? '1';
};
