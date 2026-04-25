-- PatronLog manual reclassification audit columns
ALTER TABLE "patron_logs" ADD COLUMN "reclassifiedAt" TIMESTAMP(3);
ALTER TABLE "patron_logs" ADD COLUMN "reclassifiedById" TEXT;
ALTER TABLE "patron_logs" ADD COLUMN "reclassifyReason" TEXT;
ALTER TABLE "patron_logs" ADD CONSTRAINT "patron_logs_reclassifiedById_fkey" FOREIGN KEY ("reclassifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "patron_logs_venueId_reclassifiedAt_idx" ON "patron_logs"("venueId", "reclassifiedAt");
