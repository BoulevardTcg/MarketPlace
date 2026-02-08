-- CreateTable
CREATE TABLE "TradeReadState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOfferId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeReadState_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TradeReadState_tradeOfferId_userId_key" ON "TradeReadState"("tradeOfferId", "userId");
CREATE INDEX "TradeReadState_userId_updatedAt_idx" ON "TradeReadState"("userId", "updatedAt");
