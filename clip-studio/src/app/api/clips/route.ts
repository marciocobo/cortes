import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { listClips } from "@/lib/n8n-client";

// video-library spec: "Clip library listing" + "Clip missing metadata is
// not fatal" - listClips() already tolerates a clip missing either its
// .mp4 or its _meta.json (fields come back null instead of throwing).
export async function GET() {
  try {
    await requireCapability("videoLibrary");
    const clips = await listClips();
    return NextResponse.json({ clips });
  } catch (err) {
    return toErrorResponse(err);
  }
}
