-- AlterEnum
ALTER TYPE "CfReplyStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "CfComment" ADD COLUMN "replyAttemptedAt" TIMESTAMP(3);
