-- CreateTable (SQLite)
CREATE TABLE "job_cursors" (
    "jobId" TEXT NOT NULL PRIMARY KEY,
    "cursorPage" INTEGER NOT NULL DEFAULT 1,
    "cursorLang" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
