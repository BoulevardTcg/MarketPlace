-- CreateTable (après commit de la valeur TCGDEX dans la migration précédente)
CREATE TABLE "DailyPriceSnapshot" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "source" "PriceSource" NOT NULL DEFAULT 'TCGDEX',
    "day" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trendCents" INTEGER NOT NULL,
    "lowCents" INTEGER,
    "avgCents" INTEGER,
    "highCents" INTEGER,
    "rawJson" JSONB,

    CONSTRAINT "DailyPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPriceSnapshot_cardId_language_source_day_key" ON "DailyPriceSnapshot"("cardId", "language", "source", "day");

CREATE INDEX "DailyPriceSnapshot_cardId_language_day_idx" ON "DailyPriceSnapshot"("cardId", "language", "day" DESC);
