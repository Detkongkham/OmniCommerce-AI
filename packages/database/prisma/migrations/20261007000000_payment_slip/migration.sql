-- CreateEnum
CREATE TYPE "SlipSource" AS ENUM ('CHAT', 'UPLOAD');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('PENDING_READ', 'READ', 'READ_FAILED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "receivingAccounts" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "attachmentIndex" INTEGER,
    "source" "SlipSource" NOT NULL,
    "imageKey" TEXT NOT NULL,
    "imageMime" TEXT NOT NULL,
    "imageBytes" INTEGER NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "status" "SlipStatus" NOT NULL DEFAULT 'PENDING_READ',
    "readerName" TEXT,
    "readerVersion" TEXT,
    "readAmount" DECIMAL(18,2),
    "readCurrency" "Currency",
    "readPaidAt" TIMESTAMP(3),
    "readDestAccount" TEXT,
    "readRefNo" TEXT,
    "readRaw" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmedAmount" DECIMAL(18,2),
    "confirmedCurrency" "Currency",
    "confirmedPaidAt" TIMESTAMP(3),
    "confirmedRefNo" TEXT,
    "confirmedDestAccount" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSlip_orderId_idx" ON "PaymentSlip"("orderId");

-- CreateIndex
CREATE INDEX "PaymentSlip_imageSha256_idx" ON "PaymentSlip"("imageSha256");

-- CreateIndex
CREATE INDEX "PaymentSlip_readRefNo_idx" ON "PaymentSlip"("readRefNo");

-- CreateIndex
CREATE INDEX "PaymentSlip_status_createdAt_idx" ON "PaymentSlip"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSlip_messageId_attachmentIndex_key" ON "PaymentSlip"("messageId", "attachmentIndex");

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
