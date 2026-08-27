import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";

// admin-console spec: "User management"
export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const bodySchema = z.object({
  name: z.string().trim().min(1, "Nome não pode ser vazio"),
  email: z.string().trim().email(),
  role: z.enum(["CLIPADOR", "UPLOADER", "ADMIN"]),
});

/**
 * The mockup's "add user" form has no password field - matching that, the
 * Admin only supplies name/email/role and the system generates an initial
 * password, returned once in the response so the Admin can share it with
 * the new user (same pattern as the deployment seed script).
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = bodySchema.parse(await request.json());
    const initialPassword = randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: body.role },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    return NextResponse.json({ user, initialPassword }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
