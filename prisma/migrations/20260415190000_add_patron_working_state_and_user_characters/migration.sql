-- UserCharacter bridge table
CREATE TABLE "user_characters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_characters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_characters_characterName_world_key" ON "user_characters"("characterName", "world");
CREATE INDEX "user_characters_userId_idx" ON "user_characters"("userId");
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PatronLog working-state columns
ALTER TABLE "patron_logs" ADD COLUMN "wasWorking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patron_logs" ADD COLUMN "workingUserId" TEXT;
ALTER TABLE "patron_logs" ADD CONSTRAINT "patron_logs_workingUserId_fkey" FOREIGN KEY ("workingUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "patron_logs_venueId_wasWorking_timestamp_idx" ON "patron_logs"("venueId", "wasWorking", "timestamp");
