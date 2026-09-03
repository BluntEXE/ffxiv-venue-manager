-- Legacy freeform-text fallback, superseded by structured district/ward/plot/apartment
-- fields and unreachable dead code for every real venue (verified against prod: all
-- venues with a non-empty location also have at least one structured field set).
ALTER TABLE "venues" DROP COLUMN "location";
