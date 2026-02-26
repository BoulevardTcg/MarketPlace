/*
  Warnings:

  - You are about to alter the column `rawJson` on the `DailyPriceSnapshot` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `isBanned` on the `UserModerationState` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dataJson" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerUserId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "externalRef" TEXT,
    "webhookEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingShipping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "estimatedDays" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingShipping_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewerUserId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "listingId" TEXT,
    "tradeOfferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ListingQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingQuestion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TCGDEX',
    "day" DATETIME NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trendCents" INTEGER NOT NULL,
    "lowCents" INTEGER,
    "avgCents" INTEGER,
    "highCents" INTEGER,
    "avg7Cents" INTEGER,
    "avg30Cents" INTEGER,
    "rawJson" JSONB
);
INSERT INTO "new_DailyPriceSnapshot" ("avg30Cents", "avg7Cents", "avgCents", "capturedAt", "cardId", "day", "highCents", "id", "language", "lowCents", "rawJson", "source", "trendCents") SELECT "avg30Cents", "avg7Cents", "avgCents", "capturedAt", "cardId", "day", "highCents", "id", "language", "lowCents", "rawJson", "source", "trendCents" FROM "DailyPriceSnapshot";
DROP TABLE "DailyPriceSnapshot";
ALTER TABLE "new_DailyPriceSnapshot" RENAME TO "DailyPriceSnapshot";
CREATE INDEX "DailyPriceSnapshot_cardId_language_day_idx" ON "DailyPriceSnapshot"("cardId", "language", "day" DESC);
CREATE UNIQUE INDEX "DailyPriceSnapshot_cardId_language_source_day_key" ON "DailyPriceSnapshot"("cardId", "language", "source", "day");
CREATE TABLE "new_SellerReputation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "disputesCount" INTEGER NOT NULL DEFAULT 0,
    "reportsCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SellerReputation" ("disputesCount", "id", "reportsCount", "score", "totalSales", "totalTrades", "updatedAt", "userId") SELECT "disputesCount", "id", "reportsCount", "score", "totalSales", "totalTrades", "updatedAt", "userId" FROM "SellerReputation";
DROP TABLE "SellerReputation";
ALTER TABLE "new_SellerReputation" RENAME TO "SellerReputation";
CREATE UNIQUE INDEX "SellerReputation_userId_key" ON "SellerReputation"("userId");
CREATE INDEX "SellerReputation_score_idx" ON "SellerReputation"("score");
CREATE TABLE "new_TradeOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorUserId" TEXT NOT NULL,
    "receiverUserId" TEXT NOT NULL,
    "creatorItemsJson" JSONB NOT NULL,
    "receiverItemsJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME,
    "counterOfOfferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeOffer_counterOfOfferId_fkey" FOREIGN KEY ("counterOfOfferId") REFERENCES "TradeOffer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TradeOffer" ("counterOfOfferId", "createdAt", "creatorItemsJson", "creatorUserId", "expiresAt", "id", "receiverItemsJson", "receiverUserId", "status", "updatedAt") SELECT "counterOfOfferId", "createdAt", "creatorItemsJson", "creatorUserId", "expiresAt", "id", "receiverItemsJson", "receiverUserId", "status", "updatedAt" FROM "TradeOffer";
DROP TABLE "TradeOffer";
ALTER TABLE "new_TradeOffer" RENAME TO "TradeOffer";
CREATE INDEX "TradeOffer_creatorUserId_idx" ON "TradeOffer"("creatorUserId");
CREATE INDEX "TradeOffer_receiverUserId_idx" ON "TradeOffer"("receiverUserId");
CREATE INDEX "TradeOffer_status_createdAt_idx" ON "TradeOffer"("status", "createdAt");
CREATE INDEX "TradeOffer_status_expiresAt_idx" ON "TradeOffer"("status", "expiresAt");
CREATE INDEX "TradeOffer_counterOfOfferId_idx" ON "TradeOffer"("counterOfOfferId");
CREATE TABLE "new_UserModerationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" DATETIME,
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "lastWarnAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserModerationState" ("banReason", "bannedAt", "id", "isBanned", "lastWarnAt", "updatedAt", "userId", "warnCount") SELECT "banReason", "bannedAt", "id", "isBanned", "lastWarnAt", "updatedAt", "userId", "warnCount" FROM "UserModerationState";
DROP TABLE "UserModerationState";
ALTER TABLE "new_UserModerationState" RENAME TO "UserModerationState";
CREATE UNIQUE INDEX "UserModerationState_userId_key" ON "UserModerationState"("userId");
CREATE INDEX "UserModerationState_isBanned_idx" ON "UserModerationState"("isBanned");
CREATE INDEX "UserModerationState_warnCount_idx" ON "UserModerationState"("warnCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_webhookEventId_key" ON "PurchaseOrder"("webhookEventId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_buyerUserId_status_createdAt_idx" ON "PurchaseOrder"("buyerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_listingId_status_idx" ON "PurchaseOrder"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ListingShipping_listingId_key" ON "ListingShipping"("listingId");

-- CreateIndex
CREATE INDEX "SellerReview_sellerUserId_createdAt_idx" ON "SellerReview"("sellerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_reviewerUserId_listingId_key" ON "SellerReview"("reviewerUserId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_reviewerUserId_tradeOfferId_key" ON "SellerReview"("reviewerUserId", "tradeOfferId");

-- CreateIndex
CREATE INDEX "ListingQuestion_listingId_createdAt_idx" ON "ListingQuestion"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingQuestion_askerId_createdAt_idx" ON "ListingQuestion"("askerId", "createdAt");
