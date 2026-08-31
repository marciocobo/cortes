## Context

See proposal.md - Why, and `openspec/changes/harden-youtube-cookie-refresh-validation/design.md` for the full investigation this builds on. Relevant existing pieces:
- `cookie-refresher` (`cookie-refresher/src/server.js`) exposes `POST /bootstrap` (raw Netscape `cookies.txt` body) on `cookie-refresher-1:4600`, internal-only, no auth, reachable from any container on `n8n_default`.
- `clipstudio-web-1` already sits on `n8n_default` (`VPS.md` §10, §12) alongside `cookie-refresher-1` and `n8n-n8n-1`.
- `clip-studio/src/lib/n8n-client.ts`'s `callWebhook()` already implements the retry/timeout/auth pattern (`AppConfig.n8nIngestWebhookUrl` base + `X-Clip-Studio-Secret` header) every other n8n-facing call in this app uses.
- The real end-to-end validation probe (`yt-dlp --simulate` against the freshly-written `youtube-cookies.master.txt`, from inside `n8n-n8n-1`) is a manual `docker exec` today — documented in `harden-youtube-cookie-refresh-validation/design.md`'s Decisions.

## Goals / Non-Goals

**Goals:**
- Let the Admin re-bootstrap the cookie alone, without an assisted SSH session, at whatever frequency the session actually needs it.
- Never report success unless the same real-download check already proven necessary (see the linked change) has passed.

**Non-Goals:**
- Changing `cookie-refresher` itself (its `/bootstrap` contract stays as-is).
- Automating the *export* step (still a human exporting `cookies.txt` from their own logged-in browser) — only the hand-off from export to working cookie is being streamlined.
- A general n8n-workflow-authoring capability in Clip Studio — this is one narrowly scoped webhook, not infrastructure for adding arbitrary n8n calls from the UI.

## Decisions

### Two-step backend call: `cookie-refresher` directly, n8n webhook only on bootstrap success

**Decision:** `POST /api/admin/youtube-cookie` (new Clip Studio route, `requireAdmin()`):
1. Validate the request body is non-empty text, `POST` it directly to `http://cookie-refresher-1:4600/bootstrap` (plain `fetch`, internal Docker DNS — no `AppConfig`/webhook-secret involved, since this isn't an n8n call).
2. If that response is `{"ok":false,...}`, return its `reason` to the Admin immediately — no point calling the validation webhook against a cookie that didn't even bootstrap.
3. If `{"ok":true,...}`, call the new n8n webhook (`clip-studio/youtube-cookie/validate`, via the existing `callWebhook()` helper — reuses `AppConfig.n8nIngestWebhookUrl`/secret, same as every other n8n call) and return *that* result as the final verdict.

**Why not have `cookie-refresher` itself call the n8n webhook:** `cookie-refresher` has no knowledge of Clip Studio's `AppConfig`/webhook secret, and giving it that would couple a small, single-purpose service to Clip Studio's config store for one caller. Clip Studio already owns the "call n8n webhooks" responsibility (`n8n-client.ts`) — orchestrating from there keeps `cookie-refresher` unchanged (a stated Non-Goal).

**Why not skip step 1 and let the n8n webhook do the bootstrap too:** `cookie-refresher`'s bootstrap logic (Playwright profile, `addCookies`, `chown`/`chmod` on the shared file) already exists and works — reimplementing or proxying it through n8n would duplicate real logic for no benefit. n8n's role here is narrowly "run yt-dlp and report the result," matching what it already does well (it's where `yt-dlp` lives).

### New n8n webhook workflow: Webhook Trigger → Execute Command → respond with structured result

**Decision:** a new, small n8n workflow (separate from "Blocos" and from the existing Clip Studio ingestion workflow):
- Webhook Trigger, path `clip-studio/youtube-cookie/validate`, same `X-Clip-Studio-Secret` header-auth pattern already used by this project's other Clip Studio-facing webhooks.
- Execute Command node running the exact probe from `harden-youtube-cookie-refresh-validation/design.md`'s Decisions (`docker`-internal, i.e. run *inside* `n8n-n8n-1` directly since this node executes in that container already — no `docker exec` needed here, unlike the manual SSH procedure which has to reach into the container from the host):
  ```bash
  cp /home/node/.n8n-files/youtube-cookies.master.txt /tmp/validate-cookie.txt
  chmod 600 /tmp/validate-cookie.txt
  /home/node/.n8n-files/yt-dlp --no-playlist --cookies /tmp/validate-cookie.txt \
    --js-runtimes node:/usr/local/bin/node --simulate \
    -f "bestvideo[height>=2160][ext=mp4]+bestaudio[ext=m4a]/best" \
    "https://www.youtube.com/watch?v=<a stable, always-public reference video ID>" 2>&1 | tail -30
  rm -f /tmp/validate-cookie.txt
  ```
- A Code node parses that output the same way the manual procedure's success criterion works (a real `[info] ...: Downloading N format(s)` line present, no `ERROR: ... Sign in to confirm` / `WARNING: ... cookies are no longer valid`) and responds `{"ok": true|false, "detail": "..."}`.

**Why a fixed reference video ID instead of accepting one in the request:** the manual procedure has been using whichever video most recently failed, but the validation's only real purpose is "does this cookie authenticate at all" — any stable public video works, and hardcoding one avoids the caller needing to supply a valid YouTube URL just to check cookie health. Pick any long-lived public video not tied to this project's own content.

**Explicitly flagged, not done in this design pass:** this is a production n8n change (a new workflow, built and published via MCP), separate from anything in Clip Studio's own codebase. Per this project's established pattern (`clip-studio/deploy/README.md` §3 flagged the *existing* Clip Studio ingestion webhook the same way), this needs its own clear go-ahead before touching production n8n — tracked as its own task group below, not bundled silently into "write the Clip Studio code."

### UI: new section in Configurações, same form patterns as `N8nConfigForm.tsx`

**Decision:** a textarea (paste) — not a `<input type="file">` — for the `cookies.txt` content, since the file is small (a few KB) and a paste avoids extra file-handling code for a one-off, infrequent admin action; Netscape-format cookie files are plain text, easy to paste. Submit button posts to the new route, shows one of three states: validating (spinner/"Validando..."), success ("✅ Cookie válido e testado"), or failure (the specific `reason`/`detail` from whichever step failed).

**Why not a file upload input:** no other form in this app handles file uploads yet (the closest precedent, clip downloads, goes the other direction — server to browser). A paste keeps this change scoped to existing form patterns; revisit if pasting turns out to be error-prone in practice (e.g. browsers mangling the text).

## Risks / Trade-offs

- **[Risk] The reference video used for validation could itself go private/deleted/region-locked over time, causing false failures unrelated to the cookie.** → Mitigation: pick a well-known, long-lived public video; if this becomes a real problem, revisit (e.g. accept an optional video ID override) rather than guessing now.
- **[Risk] This still doesn't fix the underlying survival-time ceiling** (`harden-youtube-cookie-refresh-validation`'s core finding) — the Admin will still need to do this several times a day. → Mitigation: none at this layer by design — this change's entire scope is making that unavoidable action fast and self-service, not eliminating the need for it.
- **[Risk] A second, parallel "call n8n" path (direct `fetch` to `cookie-refresher-1` bypassing `callWebhook()`'s retry/timeout wrapper) is a slightly different pattern than the rest of the codebase.** → Mitigation: acceptable — `cookie-refresher` isn't an n8n webhook, it doesn't share n8n's auth/retry needs (no shared secret, single internal call, not a batch pipeline operation), so reusing `callWebhook()` there would be a forced fit, not a real simplification.

## Migration Plan

1. **Clip Studio changes** (this session's implementation, once approved): new route, new `n8n-client.ts` function, new Configurações section. Deploy per the existing flow (`clip-studio/deploy/README.md` — scp + `docker compose --env-file .env up -d --build`). No DB migration needed (no new persisted fields).
2. **n8n workflow** (separate, explicit go-ahead required — see Decisions above): build the new webhook workflow via MCP, publish it, and configure its path in whatever the existing `clip-studio/ingest`-style webhooks use as their base (same `AppConfig.n8nIngestWebhookUrl`, so no new config field needed — the path is just appended, same as `triggerIngestion`'s `clip-studio/ingest`).
3. No rollback complexity — this is purely additive (a new route, a new n8n workflow); nothing existing is modified.
