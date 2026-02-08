-- CreateTable
CREATE TABLE "UserModerationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "lastWarnAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModerationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserModerationState_userId_key" ON "UserModerationState"("userId");

-- CreateIndex
CREATE INDEX "UserModerationState_isBanned_idx" ON "UserModerationState"("isBanned");

-- CreateIndex
CREATE INDEX "UserModerationState_warnCount_idx" ON "UserModerationState"("warnCount");
