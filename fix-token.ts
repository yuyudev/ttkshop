import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixToken() {
    // O ID que está no banco
    const existingShopId = 'PIN-4gAAAAC2ANmYH_dQM0XH8boI7T4gATd7POe-4idtM3Jh9ab8nw';

    // O ID que vem no webhook
    const webhookShopId = '7496227062767651682';

    const existing = await prisma.tiktokAuth.findUnique({
        where: { shopId: existingShopId }
    });

    if (!existing) {
        console.error('Existing token not found!');
        return;
    }

    console.log('Found existing token. Creating alias for webhook Shop ID...');

    await prisma.tiktokAuth.upsert({
        where: { shopId: webhookShopId },
        update: {
            accessToken: existing.accessToken,
            refreshToken: existing.refreshToken,
            accessExpiresAt: existing.accessExpiresAt,
            scopes: existing.scopes,
            tiktokShopCipher: existing.tiktokShopCipher,
            tiktokWarehouseId: existing.tiktokWarehouseId,
            tiktokDefaultCategoryId: existing.tiktokDefaultCategoryId,
            tiktokBrandId: existing.tiktokBrandId,
            tiktokBrandName: existing.tiktokBrandName,
            vtexWebhookToken: existing.vtexWebhookToken,
            vtexAffiliateId: existing.vtexAffiliateId,
            vtexSalesChannel: existing.vtexSalesChannel,
            vtexAccount: existing.vtexAccount,
            vtexEnvironment: existing.vtexEnvironment,
            vtexAppKey: existing.vtexAppKey,
            vtexAppToken: existing.vtexAppToken,
            vtexWarehouseId: existing.vtexWarehouseId,
            vtexDomain: existing.vtexDomain,
            vtexPricingDomain: existing.vtexPricingDomain,
            vtexMarketplaceServicesEndpoint: existing.vtexMarketplaceServicesEndpoint,
            vtexPaymentSystemId: existing.vtexPaymentSystemId,
            vtexPaymentSystemName: existing.vtexPaymentSystemName,
            vtexPaymentGroup: existing.vtexPaymentGroup,
            vtexPaymentMerchant: existing.vtexPaymentMerchant,
        },
        create: {
            shopId: webhookShopId,
            accessToken: existing.accessToken,
            refreshToken: existing.refreshToken,
            accessExpiresAt: existing.accessExpiresAt,
            scopes: existing.scopes,
            tiktokShopCipher: existing.tiktokShopCipher,
            tiktokWarehouseId: existing.tiktokWarehouseId,
            tiktokDefaultCategoryId: existing.tiktokDefaultCategoryId,
            tiktokBrandId: existing.tiktokBrandId,
            tiktokBrandName: existing.tiktokBrandName,
            vtexWebhookToken: existing.vtexWebhookToken,
            vtexAffiliateId: existing.vtexAffiliateId,
            vtexSalesChannel: existing.vtexSalesChannel,
            vtexAccount: existing.vtexAccount,
            vtexEnvironment: existing.vtexEnvironment,
            vtexAppKey: existing.vtexAppKey,
            vtexAppToken: existing.vtexAppToken,
            vtexWarehouseId: existing.vtexWarehouseId,
            vtexDomain: existing.vtexDomain,
            vtexPricingDomain: existing.vtexPricingDomain,
            vtexMarketplaceServicesEndpoint: existing.vtexMarketplaceServicesEndpoint,
            vtexPaymentSystemId: existing.vtexPaymentSystemId,
            vtexPaymentSystemName: existing.vtexPaymentSystemName,
            vtexPaymentGroup: existing.vtexPaymentGroup,
            vtexPaymentMerchant: existing.vtexPaymentMerchant,
        },
    });

    console.log('SUCCESS! Token copied to shop ID:', webhookShopId);
}

fixToken()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
