-- Frogge Bot integration: venue linking + room sync fields
-- Applied via prisma db push (migration chain was broken from prior db push usage)

-- Venue: link to Frogge's v2 Venue entity
ALTER TABLE "venues" ADD COLUMN "froggeVenueId" TEXT;
CREATE UNIQUE INDEX "venues_froggeVenueId_key" ON "venues"("froggeVenueId");

-- Room: sync fields for Frogge integration
ALTER TABLE "rooms" ADD COLUMN "froggeRoomId" INTEGER;
ALTER TABLE "rooms" ADD COLUMN "roomNumber" INTEGER;
ALTER TABLE "rooms" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rooms" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rooms" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
