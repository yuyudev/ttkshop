/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const { createHash, createCipheriv, randomBytes } = require('crypto');

const prisma = new PrismaClient();

const requiredEnv = [
  'SHOP_ID',
  'TIKTOK_ACCESS_TOKEN',
  'TIKTOK_REFRESH_TOKEN',
  'TOKEN_ENCRYPTION_KEY',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const {
  SHOP_ID,
  TIKTOK_ACCESS_TOKEN,
  TIKTOK_REFRESH_TOKEN,
  TOKEN_ENCRYPTION_KEY,
  TIKTOK_SCOPES,
  ACCESS_TOKEN_EXPIRES_AT,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS,
} = process.env;

const deriveAesKey = () =>
  createHash('sha256')
    .update(TOKEN_ENCRYPTION_KEY)
    .digest();

const encryptRefreshToken = (value) => {
  const key = deriveAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

const resolveExpiry = () => {
  if (ACCESS_TOKEN_EXPIRES_AT) {
    const date = new Date(ACCESS_TOKEN_EXPIRES_AT);
    if (Number.isNaN(date.getTime())) {
      throw new Error('ACCESS_TOKEN_EXPIRES_AT deve ser uma data ISO válida');
    }
    return date;
  }

  const seconds = Number(ACCESS_TOKEN_EXPIRES_IN_SECONDS ?? 3600);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('ACCESS_TOKEN_EXPIRES_IN_SECONDS deve ser um número positivo');
  }

  return new Date(Date.now() + seconds * 1000);
};

async function main() {
  const encryptedRefresh = encryptRefreshToken(TIKTOK_REFRESH_TOKEN);
  const accessExpiresAt = resolveExpiry();

  await prisma.tiktokAuth.upsert({
    where: { shopId: SHOP_ID },
    update: {
      accessToken: TIKTOK_ACCESS_TOKEN,
      accessExpiresAt,
      refreshToken: encryptedRefresh,
      scopes: TIKTOK_SCOPES ?? null,
    },
    create: {
      shopId: SHOP_ID,
      accessToken: TIKTOK_ACCESS_TOKEN,
      accessExpiresAt,
      refreshToken: encryptedRefresh,
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
