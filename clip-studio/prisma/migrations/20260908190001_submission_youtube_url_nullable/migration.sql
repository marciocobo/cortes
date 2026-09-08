-- AlterTable (file-upload submissions have no YouTube URL - see video-upload-ingestion spec)
ALTER TABLE "Submission" ALTER COLUMN "youtubeUrl" DROP NOT NULL;
