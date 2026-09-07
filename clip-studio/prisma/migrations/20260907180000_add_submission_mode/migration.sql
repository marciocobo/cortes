-- CreateEnum
CREATE TYPE "SubmissionMode" AS ENUM ('SHORTS', 'PALAVRA_COMPLETA');

-- AddColumn (defaults to SHORTS so every existing row keeps today's behavior)
ALTER TABLE "Submission" ADD COLUMN "mode" "SubmissionMode" NOT NULL DEFAULT 'SHORTS';
