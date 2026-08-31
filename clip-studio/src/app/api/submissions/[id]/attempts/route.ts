import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";

// youtube-ingestion spec: "Submission attempt history" - powers the popup
// opened by clicking an Erro status pill. Same visibility rule as the
// history table itself (creator or Admin) - a submission a caller can't
// see is reported 404, not 403, so as not to leak which ids exist.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCapability("youtubeIngestion");
    const { id } = await params;

    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission || (user.role !== "ADMIN" && submission.submittedById !== user.id)) {
      return NextResponse.json({ error: "Envio não encontrado" }, { status: 404 });
    }

    const attempts = await prisma.submissionAttempt.findMany({
      where: { submissionId: id },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json({ attempts });
  } catch (err) {
    return toErrorResponse(err);
  }
}
