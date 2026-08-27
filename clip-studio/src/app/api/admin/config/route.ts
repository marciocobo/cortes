import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";

// admin-console spec: "N8N configuration" - Admin-only.
export async function GET() {
  try {
    await requireAdmin();
    const config = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    return NextResponse.json({
      config: {
        n8nIngestWebhookUrl: config.n8nIngestWebhookUrl,
        // Never return the secret to the client once set - only whether one exists.
        n8nWebhookSharedSecretSet: Boolean(config.n8nWebhookSharedSecret),
        stuckThresholdHours: config.stuckThresholdHours,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const bodySchema = z.object({
  n8nIngestWebhookUrl: z.string().trim().url().optional(),
  n8nWebhookSharedSecret: z.string().trim().min(1).optional(),
  stuckThresholdHours: z.number().int().min(1).max(72).optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = bodySchema.parse(await request.json());

    await prisma.appConfig.upsert({
      where: { id: 1 },
      update: body,
      create: { id: 1, ...body },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
