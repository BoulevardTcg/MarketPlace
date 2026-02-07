-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "tradeOfferId" TEXT,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "requestedByUserId" TEXT NOT NULL,
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Handover_requestedByUserId_idx" ON "Handover"("requestedByUserId");

-- CreateIndex
CREATE INDEX "Handover_status_idx" ON "Handover"("status");

-- CreateIndex
CREATE INDEX "Handover_listingId_idx" ON "Handover"("listingId");

-- CreateIndex
CREATE INDEX "Handover_tradeOfferId_idx" ON "Handover"("tradeOfferId");

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
