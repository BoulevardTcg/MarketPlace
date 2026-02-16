-- DailyPriceSnapshot (SQLite: enums as TEXT)
CREATE TABLE "DailyPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TCGDEX',
    "day" DATETIME NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trendCents" INTEGER NOT NULL,
    "lowCents" INTEGER,
    "avgCents" INTEGER,
    "highCents" INTEGER,
    "rawJson" TEXT
);

CREATE UNIQUE INDEX "DailyPriceSnapshot_cardId_language_source_day_key" ON "DailyPriceSnapshot"("cardId", "language", "source", "day");
CREATE INDEX "DailyPriceSnapshot_cardId_language_day_idx" ON "DailyPriceSnapshot"("cardId", "language", "day" DESC);
