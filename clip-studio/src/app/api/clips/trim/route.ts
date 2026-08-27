import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { trimClip } from "@/lib/n8n-client";

const bodySchema = z
  .object({
    itemId: z.string().min(1),
    newStartSec: z.number().min(0),
    newEndSec: z.number(),
    currentClipDurationSec: z.number().min(0),
  })
  .refine((b) => b.newEndSec > b.newStartSec, {
    message: "O fim deve ser maior que o início",
    path: ["newEndSec"],
  })
  .refine((b) => b.newEndSec <= b.currentClipDurationSec + 0.5, {
    message: "O fim não pode passar da duração atual do clipe",
    path: ["newEndSec"],
  });

// video-library spec: "Trim (re-cut) clip"
export async function POST(request: Request) {
  try {
    await requireCapability("videoLibrary");
    const body = bodySchema.parse(await request.json());
    const result = await trimClip(body.itemId, body.newStartSec, body.newEndSec);
    return NextResponse.json({ ok: true, durationSeconds: result.durationSeconds });
  } catch (err) {
    return toErrorResponse(err);
  }
}
