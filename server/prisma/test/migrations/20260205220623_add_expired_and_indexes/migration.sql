-- CreateIndex
CREATE INDEX "Listing_status_publishedAt_idx" ON "Listing"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Listing_status_priceCents_idx" ON "Listing"("status", "priceCents");

-- CreateIndex
CREATE INDEX "Listing_userId_status_idx" ON "Listing"("userId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_status_expiresAt_idx" ON "TradeOffer"("status", "expiresAt");
