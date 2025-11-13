CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "TiktokAuth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TiktokAuth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TiktokAuth_shopId_key" UNIQUE ("shopId")
);

CREATE TABLE "ProductMap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vtexSkuId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ttsProductId" TEXT,
    "ttsSkuId" TEXT,
    "status" TEXT NOT NULL,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductMap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductMap_vtexSkuId_key" UNIQUE ("vtexSkuId")
);

CREATE TABLE "OrderMap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "ttsOrderId" TEXT NOT NULL,
    "vtexOrderId" TEXT,
    "status" TEXT NOT NULL,
    "lastError" TEXT,
    "labelUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderMap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderMap_ttsOrderId_key" UNIQUE ("ttsOrderId")
);

CREATE TABLE "Idempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadHash" TEXT NOT NULL,
    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Idempotency_key_key" UNIQUE ("key")
);
