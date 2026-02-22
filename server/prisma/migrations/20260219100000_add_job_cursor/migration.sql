-- CreateTable
CREATE TABLE "job_cursors" (
    "jobId" TEXT NOT NULL,
    "cursorPage" INTEGER NOT NULL DEFAULT 1,
    "cursorLang" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_cursors_pkey" PRIMARY KEY ("jobId")
);
