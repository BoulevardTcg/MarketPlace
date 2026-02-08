-- ExternalProductRef (SQLite: enums as TEXT)
CREATE TABLE "ExternalProductRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" TEXT,
    "externalProductId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ExternalProductRef_source_externalProductId_key" ON "ExternalProductRef"("source", "externalProductId");
CREATE INDEX "ExternalProductRef_cardId_language_idx" ON "ExternalProductRef"("cardId", "language");

-- CardPriceSnapshot
CREATE TABLE "CardPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "trendCents" INTEGER NOT NULL,
    "avgCents" INTEGER,
    "lowCents" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CardPriceSnapshot_externalProductId_capturedAt_idx" ON "CardPriceSnapshot"("externalProductId", "capturedAt");
CREATE INDEX "CardPriceSnapshot_source_capturedAt_idx" ON "CardPriceSnapshot"("source", "capturedAt");

-- UserPortfolioSnapshot
CREATE TABLE "UserPortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "totalValueCents" INTEGER NOT NULL,
    "totalCostCents" INTEGER NOT NULL,
    "pnlCents" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UserPortfolioSnapshot_userId_capturedAt_idx" ON "UserPortfolioSnapshot"("userId", "capturedAt");

-- UserCollection: add acquisition fields
ALTER TABLE "UserCollection" ADD COLUMN "acquiredAt" DATETIME;
ALTER TABLE "UserCollection" ADD COLUMN "acquisitionPriceCents" INTEGER;
ALTER TABLE "UserCollection" ADD COLUMN "acquisitionCurrency" TEXT DEFAULT 'EUR';
