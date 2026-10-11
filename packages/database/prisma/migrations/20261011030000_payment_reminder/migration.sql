-- CreateEnum
CREATE TYPE "PaymentReminderStatus" AS ENUM ('NONE', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentReminderAt" TIMESTAMP(3),
ADD COLUMN     "paymentReminderStatus" "PaymentReminderStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "paymentReminderMinutes" INTEGER;
