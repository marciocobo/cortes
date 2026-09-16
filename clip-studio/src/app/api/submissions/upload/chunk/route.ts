import { NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { UPLOAD_CHUNK_SIZE, uploadTmpPath } from "@/lib/upload-protocol";

// resumable-upload spec: "Upload one chunk". Writes the request body at the
// byte offset implied by `index` (flags "r+" - positional write, doesn't
// truncate what's already there), so chunks are idempotent to retry: the
// client resending the same index after a dropped response (chunk actually
// landed server-side, ack just never arrived) overwrites the exact same
// range with the exact same bytes.
//
// `uploadedBytes` is taken from the write stream's own `bytesWritten`, not
// the request's Content-Length header - avoids trusting a client-supplied
// number for something that gates resume position.
export async function PUT(request: Request) {
  try {
    await requireCapability("youtubeIngestion");

    const url = new URL(request.url);
    const submissionId = url.searchParams.get("submissionId");
    const indexParam = url.searchParams.get("index");
    if (!submissionId || !indexParam || !/^\d+$/.test(indexParam)) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }
    const index = Number(indexParam);

    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    // youtubeUrl is only ever null for a file-upload submission - a
    // YouTube-link one has no temp file to write chunks into.
    if (!submission || submission.youtubeUrl !== null) {
      return NextResponse.json({ error: "Envio não encontrado" }, { status: 404 });
    }
    if (submission.status !== "BAIXANDO") {
      return NextResponse.json(
        { error: "Envio não está mais em andamento - comece um novo envio." },
        { status: 409 }
      );
    }
    if (!request.body) {
      return NextResponse.json({ error: "Corpo da requisição vazio" }, { status: 400 });
    }

    const offset = index * UPLOAD_CHUNK_SIZE;
    const writeStream = createWriteStream(uploadTmpPath(submissionId), {
      flags: "r+",
      start: offset,
    });
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
      writeStream
    );

    const newUploadedBytes = BigInt(offset) + BigInt(writeStream.bytesWritten);
    if (submission.uploadedBytes === null || newUploadedBytes > submission.uploadedBytes) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { uploadedBytes: newUploadedBytes },
      });
    }

    return NextResponse.json({ ok: true, uploadedBytes: newUploadedBytes.toString() });
  } catch (err) {
    return toErrorResponse(err);
  }
}
