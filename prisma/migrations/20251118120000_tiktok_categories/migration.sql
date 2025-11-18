-- AlterTable
ALTER TABLE "ProductMap" ADD COLUMN "ttsCategoryId" TEXT;

-- CreateTable
CREATE TABLE "TiktokCategory" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "fullPath" TEXT,
    "level" INTEGER,
    "attributes" JSONB,
    "version" TEXT,
    "isLeaf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiktokCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VtexCategoryMap" (
    "id" TEXT NOT NULL,
    "vtexCategoryId" TEXT NOT NULL,
    "tiktokCategoryId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VtexCategoryMap_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TiktokCategory" ADD CONSTRAINT "TiktokCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TiktokCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TiktokCategory_parentId_idx" ON "TiktokCategory"("parentId");

-- CreateIndex
CREATE INDEX "TiktokCategory_version_idx" ON "TiktokCategory"("version");

-- CreateIndex
CREATE UNIQUE INDEX "VtexCategoryMap_vtexCategoryId_key" ON "VtexCategoryMap"("vtexCategoryId");

-- CreateIndex
CREATE INDEX "VtexCategoryMap_tiktokCategoryId_idx" ON "VtexCategoryMap"("tiktokCategoryId");
