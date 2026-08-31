import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { dispatchNextIfIdle } from "@/lib/dispatcher";

// youtube-ingestion spec: "Reprocess a failed submission" - re-queues an
// Erro submission without re-entering title/link, snapshotting the failed
// attempt first (see "Submission attempt history").
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCapability("youtubeIngestion");
    const { id } = await params;

    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission) {
      return NextResponse.json({ error: "Envio não encontrado" }, { status: 404 });
    }
    if (user.role !== "ADMIN" && submission.submittedById !== user.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    if (submission.status !== "ERRO") {
      return NextResponse.json(
        { error: "Só é possível reprocessar envios com status Erro" },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.submissionAttempt.create({
        data: {
          submissionId: submission.id,
          status: submission.status,
          errorReason: submission.errorReason,
          occurredAt: submission.updatedAt,
        },
      });
      return tx.submission.update({
        where: { id: submission.id },
        data: { status: "FILA", queuedAt: new Date(), errorReason: null },
      });
    });

    // Fire-and-forget, same pattern as POST /api/submissions - the
    // reprocess itself is already persisted regardless of dispatch outcome.
    dispatchNextIfIdle().catch((err) => console.error("[dispatcher] dispatch failed", err));

    return NextResponse.json({ submission: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
