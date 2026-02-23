-- AlterEnum uniquement (PostgreSQL : la nouvelle valeur d'enum doit être commitée avant d'être utilisée).
-- La table DailyPriceSnapshot est créée dans la migration suivante (20260216120001).
ALTER TYPE "PriceSource" ADD VALUE IF NOT EXISTS 'TCGDEX';
