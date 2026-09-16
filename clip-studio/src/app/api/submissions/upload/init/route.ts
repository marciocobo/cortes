import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { UPLOAD_CHUNK_SIZE, uploadTmpDir, uploadTmpPath } from "@/lib/upload-protocol";

// resumable-upload spec: "Start a chunked upload". Creates the Submission
// row (status BAIXANDO from the start, same reasoning as the old single-
// shot route - there is no FILA/dispatchNextIfIdle() dance for a direct
// upload, see dispatcher.ts) and an empty temp file the chunk route can
// write into at arbitrary offsets. Returns the chunk size so the client
// never has to hardcode a value that could drift from the server's.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("youtubeIngestion");

    const url = new URL(request.url);
    const title = url.searchParams.get("title")?.trim();
    const mode = url.searchParams.get("mode");
    const fileName = url.searchParams.get("fileName")?.trim();
    const contentType = url.searchParams.get("contentType") ?? "";
    const totalBytesParam = url.searchParams.get("totalBytes");

    if (!title) {
      return NextResponse.json({ error: "Título não pode ser vazio" }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: "Nome do arquivo ausente" }, { status: 400 });
    }
    if (mode !== "SHORTS" && mode !== "PALAVRA_COMPLETA" && mode !== "PODCAST") {
      return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
    }
    // Same check the old single-shot route made from the live request's
    // Content-Type header - here the client passes file.type explicitly
    // since this request has no body of its own to read a header from.
    if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
      return NextResponse.json(
        { error: "O arquivo enviado não parece ser um vídeo." },
        { status: 400 }
      );
    }
    if (!totalBytesParam || !/^\d+$/.test(totalBytesParam)) {
      return NextResponse.json({ error: "Tamanho do arquivo ausente ou inválido" }, { status: 400 });
    }
    const totalBytes = BigInt(totalBytesParam);
    if (totalBytes <= BigInt(0)) {
      return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
    }

    const submission = await prisma.submission.create({
      data: {
        youtubeUrl: null,
        title,
        mode,
        submittedById: user.id,
        status: "BAIXANDO",
        totalBytes,
        uploadedBytes: BigInt(0),
      },
    });

    await mkdir(uploadTmpDir(submission.id), { recursive: true });
    // Pre-create the file so the chunk route can open it with flags "r+"
    // (positional writes) - "r+" requires the file to already exist.
    await writeFile(uploadTmpPath(submission.id), Buffer.alloc(0));

    return NextResponse.json(
      { submissionId: submission.id, chunkSize: UPLOAD_CHUNK_SIZE },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
