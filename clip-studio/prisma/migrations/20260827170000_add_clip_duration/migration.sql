-- CreateTable
CREATE TABLE "ClipDuration" (
    "itemId" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipDuration_pkey" PRIMARY KEY ("itemId")
);
