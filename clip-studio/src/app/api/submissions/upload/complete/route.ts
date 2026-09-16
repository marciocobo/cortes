import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { triggerUploadIngestion } from "@/lib/n8n-client";
import { uploadTmpDir, uploadTmpPath } from "@/lib/upload-protocol";

// resumable-upload spec: "Finish a chunked upload". Called once the client
// has PUT every chunk. Verifies the temp file's real size matches what was
// promised at init (defensive - the chunk loop should already guarantee
// this) before handing it to n8n exactly like the old single-shot route
// did, then cleans up the temp file.
export async function POST(request: Request) {
  try {
    await requireCapability("youtubeIngestion");

    const url = new URL(request.url);
    const submissionId = url.searchParams.get("submissionId");
    const fileName = url.searchParams.get("fileName")?.trim();
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId ausente" }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: "Nome do arquivo ausente" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.youtubeUrl !== null) {
      return NextResponse.json({ error: "Envio não encontrado" }, { status: 404 });
    }
    // Idempotent: a client that retries /complete after losing the
    // response to a network blip (n8n handoff already happened) should not
    // trigger a second handoff.
    if (submission.status !== "BAIXANDO") {
      return NextResponse.json({ submission });
    }

    const tmpPath = uploadTmpPath(submissionId);

    try {
      const { size } = await stat(tmpPath);
      if (submission.totalBytes !== null && BigInt(size) !== submission.totalBytes) {
        return NextResponse.json(
          {
            error: `Envio incompleto: ${size} de ${submission.totalBytes} bytes recebidos - continue enviando os pedaços que faltam.`,
          },
          { status: 409 }
        );
      }

      await triggerUploadIngestion({
        submissionId,
        title: submission.title,
        mode: submission.mode,
        fileName,
        contentType: "application/octet-stream",
        contentLength: String(size),
        fileStream: Readable.toWeb(createReadStream(tmpPath)) as ReadableStream<Uint8Array>,
      });
      // Deliberately not setting status here - n8n's own callback to
      // /api/webhooks/n8n/ingestion is the real source of truth for
      // "Processando", same as the old single-shot route.
    } catch (err) {
      // video-upload-ingestion spec: "Upload failure does not create a
      // stuck submission" - n8n never getting/finishing the file means it
      // will never call the success/error callback, so mark it ourselves.
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "ERRO",
          errorReason:
            err instanceof Error ? err.message : "Falha ao enviar o arquivo para o N8N",
        },
      });
      throw err;
    } finally {
      await rm(uploadTmpDir(submissionId), { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup - a leftover temp file doesn't affect
        // correctness.
      });
    }

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
