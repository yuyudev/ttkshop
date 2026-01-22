/*
  Warnings:

  - A unique constraint covering the columns `[shopId,ttsOrderId]` on the table `OrderMap` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,vtexSkuId]` on the table `ProductMap` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,vtexCategoryId]` on the table `VtexCategoryMap` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
ALTER TABLE "OrderMap" DROP CONSTRAINT IF EXISTS "OrderMap_ttsOrderId_key";
DROP INDEX IF EXISTS "OrderMap_ttsOrderId_key";

-- DropIndex
ALTER TABLE "ProductMap" DROP CONSTRAINT IF EXISTS "ProductMap_vtexSkuId_key";
DROP INDEX IF EXISTS "ProductMap_vtexSkuId_key";

-- DropIndex
ALTER TABLE "VtexCategoryMap" DROP CONSTRAINT IF EXISTS "VtexCategoryMap_vtexCategoryId_key";
DROP INDEX IF EXISTS "VtexCategoryMap_vtexCategoryId_key";

-- AlterTable
ALTER TABLE "VtexCategoryMap" ADD COLUMN     "shopId" TEXT;

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tiktokShopCipher" TEXT,
    "tiktokWarehouseId" TEXT,
    "tiktokDefaultCategoryId" TEXT,
    "tiktokBrandId" TEXT,
    "tiktokBrandName" TEXT,
    "tiktokCurrency" TEXT,
    "tiktokSaveMode" TEXT,
    "tiktokPackageWeight" DOUBLE PRECISION,
    "tiktokPackageWeightUnit" TEXT,
    "tiktokPackageLength" DOUBLE PRECISION,
    "tiktokPackageWidth" DOUBLE PRECISION,
    "tiktokPackageHeight" DOUBLE PRECISION,
    "tiktokPackageDimensionUnit" TEXT,
    "tiktokMinimumOrderQuantity" INTEGER,
    "tiktokListingPlatforms" JSONB,
    "vtexAccount" TEXT,
    "vtexEnvironment" TEXT,
    "vtexDomain" TEXT,
    "vtexAppKey" TEXT,
    "vtexAppToken" TEXT,
    "vtexAffiliateId" TEXT,
    "vtexSalesChannel" TEXT,
    "vtexWarehouseId" TEXT,
    "vtexWebhookToken" TEXT,
    "vtexMarketplaceServicesEndpoint" TEXT,
    "vtexPaymentSystemId" TEXT,
    "vtexPaymentSystemName" TEXT,
    "vtexPaymentGroup" TEXT,
    "vtexPaymentMerchant" TEXT,
    "vtexPricingDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopId_key" ON "Shop"("shopId");

-- CreateIndex
CREATE INDEX "Shop_vtexAccount_idx" ON "Shop"("vtexAccount");

-- CreateIndex
CREATE INDEX "Shop_vtexAffiliateId_idx" ON "Shop"("vtexAffiliateId");

-- CreateIndex
CREATE INDEX "Shop_vtexWebhookToken_idx" ON "Shop"("vtexWebhookToken");

-- CreateIndex
CREATE INDEX "OrderMap_shopId_idx" ON "OrderMap"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMap_shopId_ttsOrderId_key" ON "OrderMap"("shopId", "ttsOrderId");

-- CreateIndex
CREATE INDEX "ProductMap_shopId_idx" ON "ProductMap"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMap_shopId_vtexSkuId_key" ON "ProductMap"("shopId", "vtexSkuId");

-- CreateIndex
CREATE INDEX "VtexCategoryMap_shopId_idx" ON "VtexCategoryMap"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "VtexCategoryMap_shopId_vtexCategoryId_key" ON "VtexCategoryMap"("shopId", "vtexCategoryId");
