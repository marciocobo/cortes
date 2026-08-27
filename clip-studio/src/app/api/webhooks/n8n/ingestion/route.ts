import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAppConfig } from "@/lib/config";
import { dispatchNextIfIdle } from "@/lib/dispatcher";

// Callback target for the new n8n ingestion workflow (tasks.md 2.5) - see
// design.md, "New n8n workflow: YouTube ingestion", step 4. This is the
// only inbound integration point Clip Studio exposes to n8n, so it is
// authenticated with the same shared secret used outbound (n8n-client.ts).

const bodySchema = z.object({
  submissionId: z.string().min(1),
  status: z.enum(["PROCESSANDO", "ERRO"]),
  uploadedFileName: z.string().optional(),
  errorReason: z.string().optional(),
});

export async function POST(request: Request) {
  const config = await getAppConfig();
  const secret = request.headers.get("x-clip-studio-secret");
  if (!config.n8nWebhookSharedSecret || secret !== config.n8nWebhookSharedSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = bodySchema.parse(await request.json());

  const submission = await prisma.submission.findUnique({ where: { id: body.submissionId } });
  if (!submission) {
    return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });
  }

  await prisma.submission.update({
    where: { id: body.submissionId },
    data:
      body.status === "PROCESSANDO"
        ? { status: "PROCESSANDO", uploadedFileName: body.uploadedFileName }
        : { status: "ERRO", errorReason: body.errorReason ?? "Falha no download do vídeo" },
  });

  // The current download slot just freed up either way - let the next
  // queued submission start (youtube-ingestion spec, "A failed download
  // does not block the queue").
  dispatchNextIfIdle().catch((err) => console.error("[dispatcher] dispatch failed", err));

  return NextResponse.json({ ok: true });
}
