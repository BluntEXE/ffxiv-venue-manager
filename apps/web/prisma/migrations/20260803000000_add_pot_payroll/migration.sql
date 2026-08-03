-- Pot payroll: per-role payout mode, pooled tips, venue pot settings, and
-- per-event pot distributions that feed payroll entries.

CREATE TYPE "PotPayoutMode" AS ENUM ('STANDARD', 'POT', 'CONTRACTOR');

ALTER TYPE "PaymentType" ADD VALUE 'POT_SHARE';

ALTER TYPE "PaymentType" ADD VALUE 'CONTRACTOR_PAYOUT';

ALTER TABLE "roles" ADD COLUMN     "contractorSharesPot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "potPayoutMode" "PotPayoutMode" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "memberships" ADD COLUMN     "tipPooled" BOOLEAN;

ALTER TABLE "shifts" ADD COLUMN     "eventId" TEXT;

CREATE INDEX "shifts_eventId_status_idx" ON "shifts"("eventId", "status");

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "venue_pot_settings" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "includeSalesInPot" BOOLEAN NOT NULL DEFAULT false,
    "defaultTipPooled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_pot_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_pot_settings_venueId_key" ON "venue_pot_settings"("venueId");

ALTER TABLE "venue_pot_settings" ADD CONSTRAINT "venue_pot_settings_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pot_distributions" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "regularSales" DECIMAL(10,2) NOT NULL,
    "contractorSales" DECIMAL(10,2) NOT NULL,
    "pooledTips" DECIMAL(10,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "potTotal" DECIMAL(10,2) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "perPersonShare" DECIMAL(10,2) NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pot_distributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pot_distributions_eventId_key" ON "pot_distributions"("eventId");

CREATE INDEX "pot_distributions_venueId_idx" ON "pot_distributions"("venueId");

ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_entries" ADD COLUMN     "potDistributionId" TEXT;

ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_potDistributionId_fkey" FOREIGN KEY ("potDistributionId") REFERENCES "pot_distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
