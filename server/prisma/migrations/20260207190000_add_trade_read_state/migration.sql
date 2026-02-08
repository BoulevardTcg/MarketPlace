-- CreateTable
CREATE TABLE "TradeReadState" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeReadState_tradeOfferId_userId_key" ON "TradeReadState"("tradeOfferId", "userId");

-- CreateIndex
CREATE INDEX "TradeReadState_userId_updatedAt_idx" ON "TradeReadState"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "TradeReadState" ADD CONSTRAINT "TradeReadState_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
