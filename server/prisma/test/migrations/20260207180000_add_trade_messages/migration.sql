-- CreateTable
CREATE TABLE "TradeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOfferId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeMessage_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TradeMessage_tradeOfferId_createdAt_id_idx" ON "TradeMessage"("tradeOfferId", "createdAt", "id");
