-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Message_sentByUserId_createdAt_idx" ON "Message"("sentByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdById_createdAt_idx" ON "Order"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");

-- CreateIndex
CREATE INDEX "StockMovement_actorId_createdAt_idx" ON "StockMovement"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: ຜູ້ເປີດບິນເກົ່າຈາກ audit `order.create` (ບິນ CF ບໍ່ມີ audit → null). ຜູ້ໃຊ້ທີ່ຖືກລຶບແລ້ວ → null
UPDATE "Order" o
SET "createdById" = a."userId"
FROM "AuditLog" a
JOIN "User" u ON u."id" = a."userId"
WHERE a."action" = 'order.create'
  AND a."entity" = 'Order'
  AND a."entityId" = o."id"
  AND o."createdById" IS NULL;
