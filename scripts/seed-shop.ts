import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ParsedArgs = {
  shopId?: string;
  name?: string;
  status?: string;
};

const toOptionalString = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toOptionalNumber = (value?: string | null) => {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const toOptionalInt = (value?: string | null) => {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
};

const parseList = (value?: string | null) => {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {};
  for (const arg of args) {
    if (arg.startsWith('--shop=')) {
      parsed.shopId = arg.slice('--shop='.length);
      continue;
    }
    if (arg.startsWith('--shopId=')) {
      parsed.shopId = arg.slice('--shopId='.length);
      continue;
    }
    if (arg.startsWith('--name=')) {
      parsed.name = arg.slice('--name='.length);
      continue;
    }
    if (arg.startsWith('--status=')) {
      parsed.status = arg.slice('--status='.length);
      continue;
    }
  }
  return parsed;
};

async function main() {
  const args = parseArgs();
  const shopId =
    toOptionalString(args.shopId) ??
    toOptionalString(process.env.TIKTOK_SHOP_ID);

  if (!shopId) {
    throw new Error(
      'Missing shopId. Provide --shop=SHOP_ID or set TIKTOK_SHOP_ID in .env.',
    );
  }

  const name = toOptionalString(args.name) ?? toOptionalString(process.env.SHOP_NAME);
  const status = toOptionalString(args.status) ?? 'active';

  const payload = {
    name,
    status,
    tiktokShopCipher: toOptionalString(process.env.TIKTOK_SHOP_CIPHER),
    tiktokWarehouseId: toOptionalString(process.env.TIKTOK_WAREHOUSE_ID),
    tiktokDefaultCategoryId: toOptionalString(process.env.TIKTOK_DEFAULT_CATEGORY_ID),
    tiktokBrandId: toOptionalString(process.env.TIKTOK_BRAND_ID),
    tiktokBrandName: toOptionalString(process.env.TIKTOK_BRAND_NAME),
    tiktokCurrency: toOptionalString(process.env.TIKTOK_CURRENCY),
    tiktokSaveMode: toOptionalString(process.env.TIKTOK_SAVE_MODE),
    tiktokPackageWeight: toOptionalNumber(process.env.TIKTOK_PACKAGE_WEIGHT),
    tiktokPackageWeightUnit: toOptionalString(process.env.TIKTOK_PACKAGE_WEIGHT_UNIT),
    tiktokPackageLength: toOptionalNumber(process.env.TIKTOK_PACKAGE_LENGTH),
    tiktokPackageWidth: toOptionalNumber(process.env.TIKTOK_PACKAGE_WIDTH),
    tiktokPackageHeight: toOptionalNumber(process.env.TIKTOK_PACKAGE_HEIGHT),
    tiktokPackageDimensionUnit: toOptionalString(process.env.TIKTOK_PACKAGE_DIMENSION_UNIT),
    tiktokMinimumOrderQuantity: toOptionalInt(process.env.TIKTOK_MINIMUM_ORDER_QUANTITY),
    tiktokListingPlatforms: parseList(process.env.TIKTOK_LISTING_PLATFORMS),
    vtexAccount: toOptionalString(process.env.VTEX_ACCOUNT),
    vtexEnvironment: toOptionalString(process.env.VTEX_ENVIRONMENT),
    vtexDomain: toOptionalString(process.env.VTEX_DOMAIN),
    vtexAppKey: toOptionalString(process.env.VTEX_APP_KEY),
    vtexAppToken: toOptionalString(process.env.VTEX_APP_TOKEN),
    vtexAffiliateId: toOptionalString(process.env.VTEX_AFFILIATE_ID),
    vtexSalesChannel: toOptionalString(process.env.VTEX_SALES_CHANNEL),
    vtexWarehouseId: toOptionalString(process.env.VTEX_WAREHOUSE_ID),
    vtexWebhookToken: toOptionalString(process.env.VTEX_WEBHOOK_TOKEN),
    vtexMarketplaceServicesEndpoint: toOptionalString(
      process.env.VTEX_MARKETPLACE_SERVICES_ENDPOINT,
    ),
    vtexPaymentSystemId: toOptionalString(process.env.VTEX_PAYMENT_SYSTEM_ID),
    vtexPaymentSystemName: toOptionalString(process.env.VTEX_PAYMENT_SYSTEM_NAME),
    vtexPaymentGroup: toOptionalString(process.env.VTEX_PAYMENT_GROUP),
    vtexPaymentMerchant: toOptionalString(process.env.VTEX_PAYMENT_MERCHANT),
    vtexPricingDomain: toOptionalString(process.env.VTEX_PRICING_DOMAIN),
  };

  const result = await prisma.shop.upsert({
    where: { shopId },
    update: payload,
    create: {
      shopId,
      ...payload,
    },
  });

  console.log(`Shop upserted: ${result.shopId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
