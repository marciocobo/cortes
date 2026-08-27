import { prisma } from "@/lib/prisma";
import { getAppConfig } from "@/lib/config";
import { isOriginalArchived } from "@/lib/n8n-client";

/**
 * PROCESSANDO -> CONCLUIDO/ERRO poller - see youtube-ingestion spec,
 * "Status reflects real pipeline completion" / "Status does not get stuck
 * silently", and design.md's "Status after the download step" decision.
 *
 * The "Blocos" pipeline itself is intentionally untouched, so there is no
 * callback for this step - this poller is the only way Clip Studio learns
 * a submission finished.
 */
export async function pollProcessingSubmissions(): Promise<void> {
  const config = await getAppConfig();
  const stuckThresholdMs = config.stuckThresholdHours * 60 * 60 * 1000;

  const processing = await prisma.submission.findMany({ where: { status: "PROCESSANDO" } });

  for (const submission of processing) {
    if (!submission.uploadedFileName) continue;

    let archived = false;
    try {
      archived = await isOriginalArchived(submission.uploadedFileName);
    } catch {
      // Transient n8n/OneDrive failure - leave status as-is, try again
      // next poll rather than prematurely erroring the submission.
      continue;
    }

    if (archived) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: "CONCLUIDO" },
      });
      continue;
    }

    const elapsed = Date.now() - submission.updatedAt.getTime();
    if (elapsed > stuckThresholdMs) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: "ERRO",
          errorReason: `Sem confirmação da esteira dentro de ${config.stuckThresholdHours}h.`,
        },
      });
    }
  }
}
