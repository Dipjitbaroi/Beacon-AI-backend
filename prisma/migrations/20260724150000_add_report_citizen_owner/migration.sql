ALTER TABLE "reports"
ADD COLUMN "citizenId" TEXT;

ALTER TABLE "reports"
ADD CONSTRAINT "reports_citizenId_fkey"
FOREIGN KEY ("citizenId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reports_citizenId_createdAt_idx"
ON "reports"("citizenId", "createdAt");
