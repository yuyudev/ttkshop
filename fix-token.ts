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
        },
        create: {
            shopId: webhookShopId,
            accessToken: existing.accessToken,
            refreshToken: existing.refreshToken,
            accessExpiresAt: existing.accessExpiresAt,
            scopes: existing.scopes,
        },
    });

    console.log('SUCCESS! Token copied to shop ID:', webhookShopId);
}

fixToken()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
