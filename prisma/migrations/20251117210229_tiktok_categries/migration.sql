-- AlterTable
ALTER TABLE IF EXISTS "TiktokCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "VtexCategoryMap" ALTER COLUMN "updatedAt" DROP DEFAULT;
