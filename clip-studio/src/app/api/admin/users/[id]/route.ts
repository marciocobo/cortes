import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";

const bodySchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["CLIPADOR", "UPLOADER", "ADMIN"]).optional(),
});

// admin-console spec: "User management" - deactivate / change role.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const user = await prisma.user.update({
      where: { id },
      data: body,
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    return toErrorResponse(err);
  }
}
