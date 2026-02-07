-- Handover (P1: remise en main propre)
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT,
    "tradeOfferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "requestedByUserId" TEXT NOT NULL,
    "verifiedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Handover_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Handover_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Handover_requestedByUserId_idx" ON "Handover"("requestedByUserId");
CREATE INDEX "Handover_status_idx" ON "Handover"("status");
CREATE INDEX "Handover_listingId_idx" ON "Handover"("listingId");
CREATE INDEX "Handover_tradeOfferId_idx" ON "Handover"("tradeOfferId");
