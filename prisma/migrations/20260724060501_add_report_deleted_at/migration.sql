-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reports_deletedAt_idx" ON "reports"("deletedAt");
