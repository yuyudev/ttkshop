import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTokens() {
    const tokens = await prisma.tiktokAuth.findMany();
    console.log('Found tokens:', tokens);

    const shopId = '7496227062767651682';
    const specific = await prisma.tiktokAuth.findUnique({ where: { shopId } });

    if (specific) {
        console.log(`Token found for shop ${shopId}: YES`);
    } else {
        console.log(`Token found for shop ${shopId}: NO`);
    }
}

checkTokens()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
