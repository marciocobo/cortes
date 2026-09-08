import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { triggerUploadIngestion } from "@/lib/n8n-client";

// video-upload-ingestion spec: "Submit a video by direct file upload".
// Metadata rides the query string and the request body is the raw file
// bytes (no multipart envelope) - see SubmitForm.tsx for why, and
// n8n-client.ts's triggerUploadIngestion() for how the body is streamed
// straight through to n8n without ever buffering it here.
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

    try {
      await triggerUploadIngestion({
        submissionId: submission.id,
        title,
        mode,
        fileName,
        contentType: contentType || "application/octet-stream",
        fileStream: request.body,
      });
      // Deliberately not setting status here. n8n's own workflow calls
      // back to /api/webhooks/n8n/ingestion (the same route the YouTube-
      // link path already uses) once the file actually lands in the
      // mode-matching OneDrive queue folder - that is the real source of
      // truth for "Processando", not "this HTTP request finished".
    } catch (err) {
      // video-upload-ingestion spec: "Upload failure does not create a
      // stuck submission" - n8n never got (or never finished receiving)
      // the stream, so it will never call the success/error callback for
      // this submission; mark it ourselves instead of leaving it stuck at
      // Baixando forever.
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

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
