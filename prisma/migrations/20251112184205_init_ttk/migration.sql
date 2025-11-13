/*
  Warnings:

  - The primary key for the `Idempotency` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `OrderMap` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProductMap` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TiktokAuth` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Idempotency" DROP CONSTRAINT "Idempotency_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "OrderMap" DROP CONSTRAINT "OrderMap_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "OrderMap_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProductMap" DROP CONSTRAINT "ProductMap_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "ProductMap_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "TiktokAuth" DROP CONSTRAINT "TiktokAuth_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "TiktokAuth_pkey" PRIMARY KEY ("id");
