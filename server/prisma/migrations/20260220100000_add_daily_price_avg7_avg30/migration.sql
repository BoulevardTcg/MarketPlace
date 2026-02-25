-- AlterTable: add avg7Cents and avg30Cents to DailyPriceSnapshot (TCGdex 7d/30d averages)
ALTER TABLE "DailyPriceSnapshot" ADD COLUMN "avg7Cents" INTEGER;
ALTER TABLE "DailyPriceSnapshot" ADD COLUMN "avg30Cents" INTEGER;
