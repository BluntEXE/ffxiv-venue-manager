-- VIP patron tracking, ban list, and room status board: this repo's schema
-- had carried these models for a while before this migration was written -
-- discovered during a bar-inventory-mapping deploy that the `patrons` and
-- `rooms` tables were never actually created in production, even though the
-- application code shipping against them had already been merged and
-- deployed. Backfilling the DDL that was missed at the time.

CREATE TABLE "patrons" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "vipSetAt" TIMESTAMP(3),
    "vipSetById" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "bannedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patrons_venueId_characterName_world_key" ON "patrons"("venueId", "characterName", "world");

CREATE INDEX "patrons_venueId_isVip_idx" ON "patrons"("venueId", "isVip");

CREATE INDEX "patrons_venueId_isBanned_idx" ON "patrons"("venueId", "isBanned");

ALTER TABLE "patrons" ADD CONSTRAINT "patrons_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patrons" ADD CONSTRAINT "patrons_vipSetById_fkey" FOREIGN KEY ("vipSetById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "patrons" ADD CONSTRAINT "patrons_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rooms_venueId_name_key" ON "rooms"("venueId", "name");

CREATE INDEX "rooms_venueId_idx" ON "rooms"("venueId");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
