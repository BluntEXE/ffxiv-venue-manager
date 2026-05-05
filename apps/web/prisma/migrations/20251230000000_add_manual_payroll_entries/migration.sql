-- AlterTable
ALTER TABLE "payroll_entries"
  ALTER COLUMN "membershipId" DROP NOT NULL,
  ADD COLUMN "isManualEntry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manualEntryName" TEXT;

-- CreateIndex
CREATE INDEX "payroll_entries_venueId_isManualEntry_idx" ON "payroll_entries"("venueId", "isManualEntry");
