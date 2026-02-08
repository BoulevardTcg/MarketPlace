-- CreateTable
CREATE TABLE "UserModerationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isBanned" INTEGER NOT NULL DEFAULT 0,
    "banReason" TEXT,
    "bannedAt" DATETIME,
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "lastWarnAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserModerationState_userId_key" ON "UserModerationState"("userId");

-- CreateIndex
CREATE INDEX "UserModerationState_isBanned_idx" ON "UserModerationState"("isBanned");

-- CreateIndex
CREATE INDEX "UserModerationState_warnCount_idx" ON "UserModerationState"("warnCount");
