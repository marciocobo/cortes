import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { UPLOAD_CHUNK_SIZE } from "@/lib/upload-protocol";

// resumable-upload spec: "Resume an interrupted upload". Lets the client
// ask the server for ground truth (how many bytes it actually has on disk)
// before resuming from a locally-remembered submissionId - the client's own
// record could be stale (e.g. the VPS restarted and the temp file is gone,
// or the submission already errored/completed through some other path).
export async function GET(request: Request) {
  try {
    await requireCapability("youtubeIngestion");

    const url = new URL(request.url);
    const submissionId = url.searchParams.get("submissionId");
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId ausente" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.youtubeUrl !== null) {
      return NextResponse.json({ error: "Envio não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      status: submission.status,
      uploadedBytes: submission.uploadedBytes?.toString() ?? "0",
      totalBytes: submission.totalBytes?.toString() ?? null,
      chunkSize: UPLOAD_CHUNK_SIZE,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
