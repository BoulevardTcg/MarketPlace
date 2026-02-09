-- UserActiveProfile (SQLite: enums as TEXT)
CREATE TABLE "UserActiveProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UserActiveProfile_userId_profileType_key" ON "UserActiveProfile"("userId", "profileType");
CREATE INDEX "UserActiveProfile_userId_idx" ON "UserActiveProfile"("userId");
