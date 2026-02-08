-- AlterTable: add isHidden column with default false (SQLite boolean = integer 0/1)
ALTER TABLE "Listing" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Listing_isHidden_idx" ON "Listing"("isHidden");
