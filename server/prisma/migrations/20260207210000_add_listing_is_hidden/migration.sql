-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Listing_isHidden_idx" ON "Listing"("isHidden");
