/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');

// Edite os valores abaixo para popular o tiktokAuth sem precisar de variáveis de ambiente
const SEED_CONFIG = {
  SHOP_ID: 'PIN-4gAAAAC2ANmYH_dQM0XH8boI7T4gATd7POe-4idtM3Jh9ab8nw',
  TIKTOK_ACCESS_TOKEN: 'ROW_Lg9D3gAAAAAGUr2nuotW1kF3eTIEZrP4Cg9C_KCIPHST8b6vOJreqPKdJOTQXgQqFmHapLvjPnwuj-NxYXntdA3S-4_tr6b0pKc0Z-vsPuVuDA7jfqg-6yxkuzi9mKEiUtwhn8wCSVnPatggBxv8V54l3-yT3fu7',
  TIKTOK_REFRESH_TOKEN: 'ROW_8_i4rQAAAADZtzvbPuBIIkeYAHT0GV__gvR52aUJEEW1Jedo6VuQS0oEBdF7colRSyW5Pf7nupU',
  TIKTOK_SCOPES: null,
  // Data de expiração do access token (ISO) ou número de segundos a partir de agora
  ACCESS_TOKEN_EXPIRES_AT: null,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS: 1764337733,
};

const prisma = new PrismaClient();

const resolveExpiry = () => {
  if (SEED_CONFIG.ACCESS_TOKEN_EXPIRES_AT) {
    const date = new Date(SEED_CONFIG.ACCESS_TOKEN_EXPIRES_AT);
    if (Number.isNaN(date.getTime())) {
      throw new Error('ACCESS_TOKEN_EXPIRES_AT deve ser uma data ISO válida');
    }
    return date;
  }

  const seconds = Number(SEED_CONFIG.ACCESS_TOKEN_EXPIRES_IN_SECONDS ?? 3600);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('ACCESS_TOKEN_EXPIRES_IN_SECONDS deve ser um número positivo');
  }

  return new Date(Date.now() + seconds * 1000);
};

async function main() {
  const {
    SHOP_ID,
    TIKTOK_ACCESS_TOKEN,
    TIKTOK_REFRESH_TOKEN,
    TIKTOK_SCOPES,
  } = SEED_CONFIG;

  if (!SHOP_ID || !TIKTOK_ACCESS_TOKEN || !TIKTOK_REFRESH_TOKEN) {
    throw new Error('Preencha SHOP_ID, TIKTOK_ACCESS_TOKEN e TIKTOK_REFRESH_TOKEN no SEED_CONFIG');
  }

  const accessExpiresAt = resolveExpiry();

  await prisma.tiktokAuth.upsert({
    where: { shopId: SHOP_ID },
    update: {
      accessToken: TIKTOK_ACCESS_TOKEN,
      accessExpiresAt,
      refreshToken: TIKTOK_REFRESH_TOKEN,
      scopes: TIKTOK_SCOPES ?? null,
    },
    create: {
      shopId: SHOP_ID,
      accessToken: TIKTOK_ACCESS_TOKEN,
      accessExpiresAt,
      refreshToken: TIKTOK_REFRESH_TOKEN,
      scopes: TIKTOK_SCOPES ?? null,
    },
  });

  console.log(`Seed concluído para shop ${SHOP_ID}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
