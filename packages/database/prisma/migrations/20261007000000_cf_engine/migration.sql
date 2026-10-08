-- CreateEnum
CREATE TYPE "LiveSessionKind" AS ENUM ('LIVE', 'POST');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('DRAFT', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CfOutcome" AS ENUM ('ORDERED', 'NO_MATCH', 'OUT_OF_STOCK', 'LIMIT_REACHED', 'ERROR');

-- CreateEnum
CREATE TYPE "CfReplyStatus" AS ENUM ('NONE', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "facebookUserId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "liveSessionId" TEXT;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "paymentInstructions" TEXT;

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "LiveSessionKind" NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "externalPostId" TEXT,
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "limit" INTEGER,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfComment" (
    "id" TEXT NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorExternalId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "outcome" "CfOutcome" NOT NULL,
    "lines" JSONB,
    "orderId" TEXT,
    "replyStatus" "CfReplyStatus" NOT NULL DEFAULT 'NONE',
    "replyErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_facebookUserId_key" ON "Customer"("facebookUserId");

-- CreateIndex
CREATE INDEX "Order_liveSessionId_customerId_status_idx" ON "Order"("liveSessionId", "customerId", "status");

-- CreateIndex
CREATE INDEX "LiveSession_status_externalPostId_idx" ON "LiveSession"("status", "externalPostId");

-- CreateIndex
CREATE INDEX "LiveSessionItem_variantId_idx" ON "LiveSessionItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionItem_sessionId_code_key" ON "LiveSessionItem"("sessionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CfComment_externalCommentId_key" ON "CfComment"("externalCommentId");

-- CreateIndex
CREATE INDEX "CfComment_sessionId_createdAt_idx" ON "CfComment"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CfComment_sessionId_authorExternalId_idx" ON "CfComment"("sessionId", "authorExternalId");

-- CreateIndex
CREATE INDEX "CfComment_orderId_idx" ON "CfComment"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CfComment" ADD CONSTRAINT "CfComment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CfComment" ADD CONSTRAINT "CfComment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ບໍ່ຢູ່ໃນ schema.prisma (Prisma ສະແດງ partial index ບໍ່ໄດ້): ຫ້າມ 2 session LIVE ໃຊ້ໂພສດຽວກັນ
CREATE UNIQUE INDEX "LiveSession_externalPostId_live_key" ON "LiveSession"("externalPostId") WHERE "status" = 'LIVE';

-- ດ່ານສຸດທ້າຍ: claimed ບໍ່ລົບ ແລະ ບໍ່ເກີນ limit
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_claimed_check" CHECK ("claimed" >= 0 AND ("limit" IS NULL OR "claimed" <= "limit"));
