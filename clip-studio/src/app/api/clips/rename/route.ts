import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { renameClip } from "@/lib/n8n-client";

const bodySchema = z.object({
  itemId: z.string().min(1),
  newName: z.string().trim().min(1, "Nome não pode ser vazio"),
});

// video-library spec: "Rename clip"
export async function POST(request: Request) {
  try {
    await requireCapability("videoLibrary");
    const body = bodySchema.parse(await request.json());
    await renameClip(body.itemId, body.newName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
