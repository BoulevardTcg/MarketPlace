-- AlterTable: add avg7Cents and avg30Cents to DailyPriceSnapshot (SQLite)
ALTER TABLE "DailyPriceSnapshot" ADD COLUMN "avg7Cents" INTEGER;
ALTER TABLE "DailyPriceSnapshot" ADD COLUMN "avg30Cents" INTEGER;
