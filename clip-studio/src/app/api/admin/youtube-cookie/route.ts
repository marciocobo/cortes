import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/api-error";
import { validateYoutubeCookie } from "@/lib/n8n-client";

const COOKIE_REFRESHER_BOOTSTRAP_URL = "http://cookie-refresher-1:4600/bootstrap";

const bodySchema = z.object({
  cookiesTxt: z.string().trim().min(1, "Cole o conteúdo do cookies.txt"),
});

type BootstrapResult = { ok: boolean; cookieCount?: number; reason?: string };

// admin-console spec: "YouTube cookie re-bootstrap" - Admin-only. Two-step
// backend call (see design.md - "Two-step backend call"): bootstrap
// directly against cookie-refresher over the internal n8n_default network,
// then - only on bootstrap success - the real end-to-end yt-dlp validation
// via the n8n webhook. A bootstrap "ok" alone is not sufficient (see
// openspec/changes/harden-youtube-cookie-refresh-validation).
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = bodySchema.parse(await request.json());

    let bootstrap: BootstrapResult;
    try {
      const res = await fetch(COOKIE_REFRESHER_BOOTSTRAP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body.cookiesTxt,
      });
      bootstrap = (await res.json()) as BootstrapResult;
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          step: "bootstrap",
          reason: err instanceof Error ? err.message : "Falha ao contatar o cookie-refresher",
        },
        { status: 502 }
      );
    }

    if (!bootstrap.ok) {
      return NextResponse.json({ ok: false, step: "bootstrap", reason: bootstrap.reason }, { status: 200 });
    }

    const validation = await validateYoutubeCookie();
    return NextResponse.json({
      ok: validation.ok,
      step: "validate",
      cookieCount: bootstrap.cookieCount,
      detail: validation.detail,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
