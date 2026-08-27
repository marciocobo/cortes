import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { deleteClip } from "@/lib/n8n-client";

const bodySchema = z.object({ itemId: z.string().min(1) });

// video-library spec: "Delete clip" - confirmation is enforced client-side
// (task 4.5); this route performs the actual deletion once confirmed.
export async function POST(request: Request) {
  try {
    await requireCapability("videoLibrary");
    const body = bodySchema.parse(await request.json());
    await deleteClip(body.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
