-- AlterTable (transfer progress for a direct file upload while status = BAIXANDO - see show-upload-progress spec)
ALTER TABLE "Submission" ADD COLUMN "uploadedBytes" BIGINT;
ALTER TABLE "Submission" ADD COLUMN "totalBytes" BIGINT;
