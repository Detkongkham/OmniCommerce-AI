-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "featuredItemId" TEXT;

-- CreateIndex
CREATE INDEX "LiveSession_featuredItemId_idx" ON "LiveSession"("featuredItemId");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_featuredItemId_fkey" FOREIGN KEY ("featuredItemId") REFERENCES "LiveSessionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

