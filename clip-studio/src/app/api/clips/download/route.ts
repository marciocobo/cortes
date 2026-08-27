import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { listClips } from "@/lib/n8n-client";

// video-library spec: "Download clip" - redirects to the OneDrive item's
// pre-authenticated @microsoft.graph.downloadUrl rather than proxying the
// file bytes through this app (see design.md - Decisions).
export async function GET(request: Request) {
  try {
    await requireCapability("videoLibrary");
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ error: "itemId ausente" }, { status: 400 });
    }

    const clips = await listClips();
    const clip = clips.find((c) => c.itemId === itemId);
    if (!clip?.downloadUrl) {
      return NextResponse.json(
        { error: "Arquivo não disponível para download" },
        { status: 404 }
      );
    }

    return NextResponse.redirect(clip.downloadUrl);
  } catch (err) {
    return toErrorResponse(err);
  }
}
