import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { isYoutubeVideoUrl } from "@/lib/youtube";
import { dispatchNextIfIdle } from "@/lib/dispatcher";

// youtube-ingestion spec: "Submission history" - Uploader sees only their
// own, Admin sees everyone's.
export async function GET() {
  try {
    const user = await requireCapability("youtubeIngestion");
    const submissions = await prisma.submission.findMany({
      where: user.role === "ADMIN" ? {} : { submittedById: user.id },
      orderBy: { createdAt: "desc" },
      include: { submittedBy: { select: { name: true } } },
    });
    return NextResponse.json({ submissions });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const bodySchema = z.object({
  youtubeUrl: z.string().trim().min(1),
  title: z.string().trim().min(1, "Título não pode ser vazio"),
});

// youtube-ingestion spec: "Submit a YouTube link"
export async function POST(request: Request) {
  try {
    const user = await requireCapability("youtubeIngestion");
    const body = bodySchema.parse(await request.json());

    if (!isYoutubeVideoUrl(body.youtubeUrl)) {
      return NextResponse.json(
        { error: "O link informado não parece ser um vídeo do YouTube válido." },
        { status: 400 }
      );
    }

    const submission = await prisma.submission.create({
      data: {
        youtubeUrl: body.youtubeUrl,
        title: body.title,
        submittedById: user.id,
        status: "FILA",
      },
    });

    // Fire-and-forget: dispatch immediately if the queue is idle, but the
    // submission itself is already persisted regardless of dispatch outcome.
    dispatchNextIfIdle().catch((err) => console.error("[dispatcher] dispatch failed", err));

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
