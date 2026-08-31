-- AddColumn (nullable first so existing rows can be backfilled)
ALTER TABLE "Submission" ADD COLUMN "queuedAt" TIMESTAMP(3);

-- Backfill: existing rows keep their original queue position (queuedAt = createdAt)
UPDATE "Submission" SET "queuedAt" = "createdAt" WHERE "queuedAt" IS NULL;

-- Enforce NOT NULL + default for future inserts
ALTER TABLE "Submission" ALTER COLUMN "queuedAt" SET NOT NULL;
ALTER TABLE "Submission" ALTER COLUMN "queuedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SubmissionAttempt" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL,
    "errorReason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionAttempt_submissionId_occurredAt_idx" ON "SubmissionAttempt"("submissionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
