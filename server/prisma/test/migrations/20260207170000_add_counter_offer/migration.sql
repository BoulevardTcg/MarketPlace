-- SQLite: no enum change (stored as TEXT). Add counterOfOfferId to TradeOffer.
ALTER TABLE "TradeOffer" ADD COLUMN "counterOfOfferId" TEXT;
CREATE INDEX "TradeOffer_counterOfOfferId_idx" ON "TradeOffer"("counterOfOfferId");

-- SQLite doesn't support ADD CONSTRAINT for existing tables easily; Prisma may handle FK via schema.
-- If SQLite version supports it: no separate FK needed for SQLite in same file.
