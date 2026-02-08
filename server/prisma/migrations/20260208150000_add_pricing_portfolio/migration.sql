-- Enum
CREATE TYPE "PriceSource" AS ENUM ('CARDMARKET', 'TCGPLAYER');

-- ExternalProductRef
CREATE TABLE "ExternalProductRef" (
    "id" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "game" "Game" NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" "Language",
    "externalProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalProductRef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExternalProductRef_source_externalProductId_key" ON "ExternalProductRef"("source", "externalProductId");
CREATE INDEX "ExternalProductRef_cardId_language_idx" ON "ExternalProductRef"("cardId", "language");

-- CardPriceSnapshot
CREATE TABLE "CardPriceSnapshot" (
    "id" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "trendCents" INTEGER NOT NULL,
    "avgCents" INTEGER,
    "lowCents" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardPriceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CardPriceSnapshot_externalProductId_capturedAt_idx" ON "CardPriceSnapshot"("externalProductId", "capturedAt");
CREATE INDEX "CardPriceSnapshot_source_capturedAt_idx" ON "CardPriceSnapshot"("source", "capturedAt");

-- UserPortfolioSnapshot
CREATE TABLE "UserPortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalValueCents" INTEGER NOT NULL,
    "totalCostCents" INTEGER NOT NULL,
    "pnlCents" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPortfolioSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserPortfolioSnapshot_userId_capturedAt_idx" ON "UserPortfolioSnapshot"("userId", "capturedAt");

-- UserCollection: add acquisition fields
ALTER TABLE "UserCollection" ADD COLUMN "acquiredAt" TIMESTAMP(3);
ALTER TABLE "UserCollection" ADD COLUMN "acquisitionPriceCents" INTEGER;
ALTER TABLE "UserCollection" ADD COLUMN "acquisitionCurrency" TEXT DEFAULT 'EUR';
