-- UserProfile
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "listingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_username_idx" ON "UserProfile"("username");

-- UserCollection: add game, isPublic columns
ALTER TABLE "UserCollection" ADD COLUMN "game" "Game";
ALTER TABLE "UserCollection" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "UserCollection_userId_isPublic_idx" ON "UserCollection"("userId", "isPublic");

-- PriceSnapshot
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "day" DATE NOT NULL,
    "medianPriceCents" INTEGER NOT NULL,
    "minPriceCents" INTEGER NOT NULL,
    "maxPriceCents" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceSnapshot_cardId_language_day_key" ON "PriceSnapshot"("cardId", "language", "day");
CREATE INDEX "PriceSnapshot_cardId_language_idx" ON "PriceSnapshot"("cardId", "language");

-- PriceAlert
CREATE TYPE "AlertDirection" AS ENUM ('DROP', 'RISE');
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "thresholdCents" INTEGER NOT NULL,
    "direction" "AlertDirection" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceAlert_userId_idx" ON "PriceAlert"("userId");
CREATE INDEX "PriceAlert_cardId_language_idx" ON "PriceAlert"("cardId", "language");
CREATE INDEX "PriceAlert_active_direction_idx" ON "PriceAlert"("active", "direction");
