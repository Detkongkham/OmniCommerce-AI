-- AlterEnum
ALTER TYPE "SlipSource" ADD VALUE 'STOREFRONT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "shippingBranch" TEXT,
ADD COLUMN     "shippingCourierId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");

-- CreateIndex
CREATE INDEX "Order_shippingCourierId_idx" ON "Order"("shippingCourierId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingCourierId_fkey" FOREIGN KEY ("shippingCourierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
