-- Bar inventory mapping: per-venue opt-in toggle, plus item-link/stock
-- fields on services so a "drink" is an existing Service with these
-- populated rather than a new item table.

CREATE TABLE "venue_inventory_settings" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_inventory_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_inventory_settings_venueId_key" ON "venue_inventory_settings"("venueId");

ALTER TABLE "venue_inventory_settings" ADD CONSTRAINT "venue_inventory_settings_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" ADD COLUMN     "linkedItemId" INTEGER,
ADD COLUMN     "linkedItemName" TEXT,
ADD COLUMN     "linkedItemIcon" INTEGER,
ADD COLUMN     "stockCount" INTEGER;
