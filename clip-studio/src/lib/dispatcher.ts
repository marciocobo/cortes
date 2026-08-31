import { prisma } from "@/lib/prisma";
import { triggerIngestion } from "@/lib/n8n-client";

/**
 * Sequential download queue - see youtube-ingestion spec, "Downloads run
 * one at a time, in submission order", and design.md's "Sequential
 * download queue (Clip Studio-owned)" decision.
 *
 * Clip Studio - not n8n - enforces "at most one BAIXANDO at a time". This
 * is intentionally simple (a DB check, not a distributed lock) because
 * this app runs as a single long-running Docker container (see design.md,
 * Deployment topology), not multiple serverless instances.
 */
export async function dispatchNextIfIdle(): Promise<void> {
  const inFlight = await prisma.submission.findFirst({ where: { status: "BAIXANDO" } });
  if (inFlight) return;

  const next = await prisma.submission.findFirst({
    where: { status: "FILA" },
    orderBy: { queuedAt: "asc" },
  });
  if (!next) return;

  await prisma.submission.update({ where: { id: next.id }, data: { status: "BAIXANDO" } });

  try {
    await triggerIngestion({
      submissionId: next.id,
      youtubeUrl: next.youtubeUrl,
      title: next.title,
    });
  } catch (err) {
    // A failed download must not block the queue - see youtube-ingestion
    // spec, "A failed download does not block the queue".
    await prisma.submission.update({
      where: { id: next.id },
      data: {
        status: "ERRO",
        errorReason: err instanceof Error ? err.message : "Falha ao chamar o webhook de ingestão do N8N",
      },
    });
    await dispatchNextIfIdle();
  }
}
