-- CreateEnum
CREATE TYPE "MemberTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PointEntryType" AS ENUM ('EARN', 'EARN_REVERSAL', 'REDEEM', 'REDEEM_REFUND', 'ADJUST');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "pointsBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tier" "MemberTier" NOT NULL DEFAULT 'BRONZE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pointsDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pointValue" DECIMAL(18,2) NOT NULL DEFAULT 100,
ADD COLUMN     "pointsEarnPer" DECIMAL(18,2) NOT NULL DEFAULT 10000,
ADD COLUMN     "pointsMaxRedeemPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "tierRules" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "PointEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointEntry_customerId_createdAt_idx" ON "PointEntry"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointEntry_orderId_type_key" ON "PointEntry"("orderId", "type");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ຍອດແຕ້ມຕິດລົບບໍ່ໄດ້ (ຂຽນດ້ວຍມື: Prisma ບໍ່ຮອງຮັບ CHECK)
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pointsBalance_check" CHECK ("pointsBalance" >= 0);
