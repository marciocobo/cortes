import { NextResponse } from "next/server";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { triggerUploadIngestion } from "@/lib/n8n-client";

// video-upload-ingestion spec: "Submit a video by direct file upload".
// Metadata rides the query string; the request body is the raw file bytes
// (no multipart envelope) - see SubmitForm.tsx for why.
//
// The body is buffered to a local temp file before being forwarded to n8n,
// NOT proxied live - n8n is itself a Node process with the same
// unconfigured 5-minute server.requestTimeout default this app used to
// have (see server.js for the fix on this side). Proxying a real user's
// slow multi-GB upload straight through would just move the same 408
// Request Timeout onto n8n's leg instead of fixing it - confirmed with a
// throttled upload test that reproduced the identical 408 against n8n even
// after this app's own timeout was disabled. n8n is a third-party package;
// patching its server bootstrap isn't viable (breaks on every update).
// Buffering here means the Next.js -> n8n leg is always a fast,
// VPS-internal transfer (measured: 2.2GB in ~40s) regardless of how slow
// the uploader's own connection is.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("youtubeIngestion");

    const url = new URL(request.url);
    const title = url.searchParams.get("title")?.trim();
    const mode = url.searchParams.get("mode");
    const fileName = url.searchParams.get("fileName")?.trim();

    if (!title) {
      return NextResponse.json({ error: "Título não pode ser vazio" }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: "Nome do arquivo ausente" }, { status: 400 });
    }
    if (mode !== "SHORTS" && mode !== "PALAVRA_COMPLETA" && mode !== "PODCAST") {
      return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    // video-upload-ingestion spec: "Non-video file rejected". A browser
    // sets this from the File object's own type, which is itself derived
    // from the file's extension/content - not a strong guarantee, but
    // consistent with how every other upload check in this codebase works.
    if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
      return NextResponse.json(
        { error: "O arquivo enviado não parece ser um vídeo." },
        { status: 400 }
      );
    }
    if (!request.body) {
      return NextResponse.json({ error: "Corpo da requisição vazio" }, { status: 400 });
    }

    const submission = await prisma.submission.create({
      data: {
        youtubeUrl: null,
        title,
        mode,
        submittedById: user.id,
        // No FILA -> dispatchNextIfIdle() dance here, unlike a YouTube
        // link: the "download" this status represents IS the upload
        // already streaming in this very request (design.md decision 5),
        // so there is nothing left to serialize or dispatch later.
        status: "BAIXANDO",
      },
    });

    const tmpDir = await mkdtemp(join(tmpdir(), "clip-studio-upload-"));
    const tmpPath = join(tmpDir, "upload");

    try {
      try {
        // Node's fetch (undici) needs a Web ReadableStream body, but
        // request.body already is one - no conversion needed to write it
        // out with the Node fs/stream APIs below via Readable.fromWeb.
        await pipeline(
          Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
          createWriteStream(tmpPath)
        );
        const { size } = await stat(tmpPath);

        await triggerUploadIngestion({
          submissionId: submission.id,
          title,
          mode,
          fileName,
          contentType: contentType || "application/octet-stream",
          contentLength: String(size),
          fileStream: Readable.toWeb(
            createReadStream(tmpPath)
          ) as ReadableStream<Uint8Array>,
        });
        // Deliberately not setting status here. n8n's own workflow calls
        // back to /api/webhooks/n8n/ingestion (the same route the YouTube-
        // link path already uses) once the file actually lands in the
        // mode-matching OneDrive queue folder - that is the real source of
        // truth for "Processando", not "this HTTP request finished".
      } catch (err) {
        // video-upload-ingestion spec: "Upload failure does not create a
        // stuck submission" - covers both a failed local write (browser
        // disconnected mid-upload, disk full) and n8n never getting (or
        // never finishing receiving) the file; either way n8n will never
        // call the success/error callback for this submission, so mark it
        // ourselves instead of leaving it stuck at Baixando forever.
        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: "ERRO",
            errorReason:
              err instanceof Error ? err.message : "Falha ao enviar o arquivo para o N8N",
          },
        });
        throw err;
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup - a leftover temp file doesn't affect
        // correctness, and every failure path above already recorded its
        // own error.
      });
    }

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
