import { prisma } from "@/lib/prisma";
import { triggerIngestion } from "@/lib/n8n-client";

// resumable-upload spec: a direct file upload can now sit in BAIXANDO
// indefinitely while paused (chunk retries exhausted, waiting for the user
// to resume - see api/submissions/upload/chunk and SubmitForm.tsx), instead
// of always resolving to ERRO within one request's lifetime like the old
// single-shot route did. Left unchecked, an abandoned upload (browser
// closed for good, user never comes back) would permanently block the
// YouTube-link queue below, since "at most one BAIXANDO at a time" has no
// other way to move on. `updatedAt` advances on every successful chunk
// (chunk route), so no activity for this long really does mean abandoned,
// not just a slow connection - a healthy upload updates far more often
// than this even on the flaky connection observed in production.
const STALE_UPLOAD_MS = 60 * 60 * 1000; // 1h

async function reapStaleDirectUploads(): Promise<void> {
  await prisma.submission.updateMany({
    where: {
      status: "BAIXANDO",
      youtubeUrl: null,
      updatedAt: { lt: new Date(Date.now() - STALE_UPLOAD_MS) },
    },
    data: {
      status: "ERRO",
      errorReason: "Envio interrompido - sem atividade por mais de 1 hora.",
    },
  });
}

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
  await reapStaleDirectUploads();
  const inFlight = await prisma.submission.findFirst({ where: { status: "BAIXANDO" } });
  if (inFlight) return;

  const next = await prisma.submission.findFirst({
    where: { status: "FILA" },
    orderBy: { queuedAt: "asc" },
  });
  if (!next) return;

  await prisma.submission.update({ where: { id: next.id }, data: { status: "BAIXANDO" } });

  try {
    // youtubeUrl is only ever null for a file-upload submission
    // (video-upload-ingestion spec), and those are created with status
    // BAIXANDO directly - never FILA - so they never reach this query in
    // the first place (see /api/submissions/upload/route.ts).
    await triggerIngestion({
      submissionId: next.id,
      youtubeUrl: next.youtubeUrl!,
      title: next.title,
      mode: next.mode,
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
