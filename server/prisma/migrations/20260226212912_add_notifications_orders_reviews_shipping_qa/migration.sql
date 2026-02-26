-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TRADE_OFFER_RECEIVED', 'TRADE_OFFER_ACCEPTED', 'TRADE_OFFER_REJECTED', 'TRADE_OFFER_CANCELLED', 'TRADE_OFFER_COUNTERED', 'TRADE_MESSAGE_RECEIVED', 'LISTING_SOLD', 'LISTING_QUESTION_RECEIVED', 'LISTING_QUESTION_ANSWERED', 'PRICE_ALERT_TRIGGERED', 'PURCHASE_ORDER_RECEIVED', 'PURCHASE_ORDER_COMPLETED', 'PURCHASE_ORDER_CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('PICKUP', 'COLISSIMO', 'MONDIAL_RELAY', 'LETTRE_SUIVIE', 'OTHER');

-- AlterTable
ALTER TABLE "SellerReputation" ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0,
                               ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dataJson" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "externalRef" TEXT,
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingShipping" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "method" "ShippingMethod" NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "estimatedDays" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingShipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerReview" (
    "id" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "listingId" TEXT,
    "tradeOfferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingQuestion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_webhookEventId_key" ON "PurchaseOrder"("webhookEventId");
CREATE INDEX "PurchaseOrder_buyerUserId_status_createdAt_idx" ON "PurchaseOrder"("buyerUserId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_listingId_status_idx" ON "PurchaseOrder"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ListingShipping_listingId_key" ON "ListingShipping"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_reviewerUserId_listingId_key" ON "SellerReview"("reviewerUserId", "listingId");
CREATE UNIQUE INDEX "SellerReview_reviewerUserId_tradeOfferId_key" ON "SellerReview"("reviewerUserId", "tradeOfferId");
CREATE INDEX "SellerReview_sellerUserId_createdAt_idx" ON "SellerReview"("sellerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingQuestion_listingId_createdAt_idx" ON "ListingQuestion"("listingId", "createdAt");
CREATE INDEX "ListingQuestion_askerId_createdAt_idx" ON "ListingQuestion"("askerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingShipping" ADD CONSTRAINT "ListingShipping_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingQuestion" ADD CONSTRAINT "ListingQuestion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
