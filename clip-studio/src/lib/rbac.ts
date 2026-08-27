import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

/**
 * Central permission table - see auth-rbac spec, "Role-gated access".
 * Keep this as the single source of truth: both page gating (proxy.ts)
 * and every API route below call into this, never trusting client state.
 */
export const CAPABILITY_ROLES = {
  videoLibrary: ["CLIPADOR", "ADMIN"],
  youtubeIngestion: ["UPLOADER", "ADMIN"],
  adminConsole: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;

export class UnauthorizedError extends Error {
  status: number;
  constructor(message = "Não autorizado") {
    super(message);
    this.status = 403;
    this.name = "UnauthorizedError";
  }
}

export class UnauthenticatedError extends Error {
  status: number;
  constructor(message = "Não autenticado") {
    super(message);
    this.status = 401;
    this.name = "UnauthenticatedError";
  }
}

/**
 * Loads the current session and asserts the user's role is allowed for
 * `capability`. Throws UnauthenticatedError / UnauthorizedError - callers
 * (API routes) turn those into the matching HTTP response. This is the
 * helper every API route in sections 4-6 must call before doing anything -
 * see auth-rbac spec's "API rejects unauthorized role" scenario.
 */
export async function requireCapability(capability: Capability) {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError();
  }

  // JWT sessions aren't revocable by themselves - re-check `active`
  // against the DB on every request so a deactivated account stops
  // working immediately, not just after the JWT's own expiry. See
  // auth-rbac spec, "Session persistence and logout" / "Deactivated
  // account", and admin-console spec's "Admin deactivates a user".
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, role: true },
  });
  if (!dbUser?.active) {
    throw new UnauthenticatedError("Conta desativada");
  }

  const allowed = CAPABILITY_ROLES[capability] as readonly Role[];
  if (!allowed.includes(dbUser.role)) {
    throw new UnauthorizedError();
  }
  return { ...session.user, role: dbUser.role };
}

/** Admin-only helper, used by user management / N8N config routes. */
export async function requireAdmin() {
  return requireCapability("adminConsole");
}
