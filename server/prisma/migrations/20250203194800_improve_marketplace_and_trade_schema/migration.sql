-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('CARD', 'SEALED', 'ACCESSORY');
CREATE TYPE "Game" AS ENUM ('POKEMON', 'ONE_PIECE', 'MTG', 'YUGIOH', 'LORCANA', 'OTHER');
CREATE TYPE "Language" AS ENUM ('FR', 'EN', 'JP', 'DE', 'ES', 'IT', 'OTHER');
CREATE TYPE "CardCondition" AS ENUM ('NM', 'LP', 'MP', 'HP', 'DMG');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED');
CREATE TYPE "ListingEventType" AS ENUM ('CREATED', 'PUBLISHED', 'UPDATED', 'SOLD', 'ARCHIVED');
CREATE TYPE "TradeOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "TradeEventType" AS ENUM ('CREATED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ListingCategory" NOT NULL,
    "game" "Game" NOT NULL,
    "language" "Language" NOT NULL,
    "condition" "CardCondition" NOT NULL,
    "setCode" TEXT,
    "cardId" TEXT,
    "cardName" TEXT,
    "edition" TEXT,
    "attributesJson" JSONB,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "ListingEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardName" TEXT,
    "setCode" TEXT,
    "language" "Language" NOT NULL,
    "condition" "CardCondition" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "receiverUserId" TEXT NOT NULL,
    "creatorItemsJson" JSONB NOT NULL,
    "receiverItemsJson" JSONB NOT NULL,
    "status" "TradeOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvent" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "type" "TradeEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
CREATE INDEX "Listing_game_language_condition_idx" ON "Listing"("game", "language", "condition");
CREATE INDEX "Listing_cardId_idx" ON "Listing"("cardId");
CREATE INDEX "Listing_setCode_idx" ON "Listing"("setCode");

-- CreateIndex
CREATE INDEX "ListingEvent_listingId_idx" ON "ListingEvent"("listingId");
CREATE INDEX "ListingEvent_actorUserId_idx" ON "ListingEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCollection_userId_cardId_language_condition_key" ON "UserCollection"("userId", "cardId", "language", "condition");
CREATE INDEX "UserCollection_userId_idx" ON "UserCollection"("userId");
CREATE INDEX "UserCollection_cardId_idx" ON "UserCollection"("cardId");

-- CreateIndex
CREATE INDEX "TradeOffer_creatorUserId_idx" ON "TradeOffer"("creatorUserId");
CREATE INDEX "TradeOffer_receiverUserId_idx" ON "TradeOffer"("receiverUserId");
CREATE INDEX "TradeOffer_status_createdAt_idx" ON "TradeOffer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeEvent_tradeOfferId_idx" ON "TradeEvent"("tradeOfferId");
CREATE INDEX "TradeEvent_actorUserId_idx" ON "TradeEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
