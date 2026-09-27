import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { listClips, type ContentType } from "@/lib/n8n-client";

const CONTENT_TYPES: readonly string[] = ["PREGACAO", "LOUVOR", "PODCAST"];

// video-library spec: "Clip library listing" + "Clip missing metadata is
// not fatal" - listClips() already tolerates a clip missing either its
// .mp4 or its _meta.json (fields come back null instead of throwing).
export async function GET(request: Request) {
  try {
    await requireCapability("videoLibrary");
    // ?type= scopes the listing to one content type (the library only loads
    // a type's clips once the user picks it); absent = every type.
    const type = new URL(request.url).searchParams.get("type");
    if (type !== null && !CONTENT_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    const clips = await listClips((type as ContentType | null) ?? undefined);
    return NextResponse.json({ clips });
  } catch (err) {
    return toErrorResponse(err);
  }
}
