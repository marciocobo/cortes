import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CAPABILITY_ROLES, type Capability } from "@/lib/rbac";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (same runtime, same
// execution point before rendering) - see node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md.
//
// This only gates PAGES so a role without access can't load a tab by
// typing its URL directly (auth-rbac spec, "Role-gated access"). It is a
// UX guard, not the security boundary - every API route still calls
// requireCapability() itself (see rbac.ts), because a Server Function/API
// route reached by a path this matcher doesn't cover would otherwise be
// unprotected (see the "Execution order" warning in proxy.md).

const ROUTE_CAPABILITY: Record<string, Capability> = {
  "/videos": "videoLibrary",
  "/enviar": "youtubeIngestion",
  "/admin": "adminConsole",
};

export async function proxy(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const matchedRoute = Object.keys(ROUTE_CAPABILITY).find(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  if (!matchedRoute) return NextResponse.next();

  const session = await auth();
  if (!session?.user) {
    const loginUrl = new URL("/login", url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const capability = ROUTE_CAPABILITY[matchedRoute];
  const allowedRoles = CAPABILITY_ROLES[capability] as readonly string[];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.redirect(new URL("/", url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/videos/:path*", "/enviar/:path*", "/admin/:path*"],
};
