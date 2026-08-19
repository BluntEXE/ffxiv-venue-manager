-- Frogge Bot: per-venue bearer token metadata
ALTER TABLE "venues" ADD COLUMN "froggeConnectedAt" TIMESTAMP(3);
ALTER TABLE "venues" ADD COLUMN "froggeConnectedBy" TEXT;
