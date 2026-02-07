-- UserProfile
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "trustScore" REAL NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "listingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_username_idx" ON "UserProfile"("username");

-- UserCollection: add game, isPublic columns
ALTER TABLE "UserCollection" ADD COLUMN "game" TEXT;
ALTER TABLE "UserCollection" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT 0;
CREATE INDEX "UserCollection_userId_isPublic_idx" ON "UserCollection"("userId", "isPublic");

-- PriceSnapshot
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "medianPriceCents" INTEGER NOT NULL,
    "minPriceCents" INTEGER NOT NULL,
    "maxPriceCents" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PriceSnapshot_cardId_language_day_key" ON "PriceSnapshot"("cardId", "language", "day");
CREATE INDEX "PriceSnapshot_cardId_language_idx" ON "PriceSnapshot"("cardId", "language");

-- PriceAlert
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "thresholdCents" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT 1,
    "triggeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "PriceAlert_userId_idx" ON "PriceAlert"("userId");
CREATE INDEX "PriceAlert_cardId_language_idx" ON "PriceAlert"("cardId", "language");
CREATE INDEX "PriceAlert_active_direction_idx" ON "PriceAlert"("active", "direction");
