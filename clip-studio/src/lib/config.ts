import { prisma } from "@/lib/prisma";

/**
 * AppConfig is a single-row table (id=1) - see design.md, Data model & ORM.
 * Falls back to env vars only for local bootstrap before an Admin has
 * saved anything through the admin-console screen (task 6.3).
 */
export async function getAppConfig() {
  const row = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return {
    n8nIngestWebhookUrl: row.n8nIngestWebhookUrl ?? process.env.N8N_WEBHOOK_BASE_URL ?? null,
    n8nWebhookSharedSecret:
      row.n8nWebhookSharedSecret ?? process.env.N8N_WEBHOOK_SHARED_SECRET ?? null,
    stuckThresholdHours: row.stuckThresholdHours,
  };
}
