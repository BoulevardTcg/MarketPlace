-- Enum swap (PostgreSQL: add COUNTERED to TradeEventType without ALTER TYPE ADD VALUE in transaction)
CREATE TYPE "TradeEventType_new" AS ENUM ('CREATED','ACCEPTED','REJECTED','CANCELLED','EXPIRED','COUNTERED');
ALTER TABLE "TradeEvent"
  ALTER COLUMN "type" TYPE "TradeEventType_new"
  USING ("type"::text::"TradeEventType_new");
DROP TYPE "TradeEventType";
ALTER TYPE "TradeEventType_new" RENAME TO "TradeEventType";

-- AlterTable: add counterOfOfferId to TradeOffer
ALTER TABLE "TradeOffer" ADD COLUMN "counterOfOfferId" TEXT;

-- CreateIndex
CREATE INDEX "TradeOffer_counterOfOfferId_idx" ON "TradeOffer"("counterOfOfferId");

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_counterOfOfferId_fkey" FOREIGN KEY ("counterOfOfferId") REFERENCES "TradeOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
