-- CreateIndex: partial unique index for anti-spam (1 OPEN report max per reporter+listing)
CREATE UNIQUE INDEX "ListingReport_open_unique"
ON "ListingReport" ("listingId", "reporterUserId")
WHERE "status" = 'OPEN';
