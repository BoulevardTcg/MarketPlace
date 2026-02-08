-- CreateTable
CREATE TABLE "TradeMessage" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeMessage_tradeOfferId_createdAt_id_idx" ON "TradeMessage"("tradeOfferId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "TradeMessage" ADD CONSTRAINT "TradeMessage_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
