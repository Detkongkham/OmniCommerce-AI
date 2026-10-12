-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinVersion" INTEGER NOT NULL DEFAULT 0;
