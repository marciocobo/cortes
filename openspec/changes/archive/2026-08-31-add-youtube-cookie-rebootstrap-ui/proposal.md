## Why

Real production data from 2026-08-31 (see `openspec/changes/harden-youtube-cookie-refresh-validation/design.md`) showed the YouTube session `cookie-refresher` depends on survives only ~1-3h regardless of usage pattern, not "a day" as originally assumed — meaning a human needs to re-export and re-bootstrap a fresh `cookies.txt` several times a day for the ingestion pipeline to keep working. Today that re-bootstrap requires an assisted multi-step process (export the file, hand it to an operator with VPS SSH access, who runs `scp` + `docker cp` + a `wget --method=POST --body-file=...` call by hand) — not something the account owner can do alone, at a frequency that no longer fits an assisted workflow.

## What Changes

- Add a YouTube cookie re-bootstrap section to the existing Admin Configurações screen: paste/upload a fresh `cookies.txt`, submit, see one consolidated result.
- On submit, Clip Studio's backend forwards the content to `cookie-refresher`'s `/bootstrap` endpoint directly over the internal `n8n_default` Docker network (both containers already share that network — no new public exposure, consistent with `youtube-cookie-auth`'s existing "Internal-only exposure" requirement).
- If bootstrap reports success, Clip Studio's backend also calls a new small n8n webhook workflow that runs the real end-to-end `yt-dlp --simulate` probe (the exact check documented in `harden-youtube-cookie-refresh-validation/design.md` — n8n already has `yt-dlp` installed, so this reuses existing infrastructure instead of giving `clipstudio-web-1` Docker-socket access to exec into `n8n-n8n-1` itself). The screen shows one consolidated pass/fail result, not just the bootstrap response — this closes the exact "bootstrap said ok but the real download still failed" gap `harden-youtube-cookie-refresh-validation` was created to address.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-studio/admin-console`: adds a "YouTube cookie re-bootstrap" requirement (Admin-only, matching the existing pattern of "N8N configuration") — upload a fresh cookie, get a real validated result, without needing an assisted SSH session.

## Impact

- `clip-studio/src/app/(dashboard)/admin/configuracoes/` — new form/section alongside `N8nConfigForm.tsx`.
- `clip-studio/src/app/api/admin/youtube-cookie/route.ts` (new) — Admin-only endpoint: forwards to `cookie-refresher-1:4600/bootstrap`, then on success calls the new n8n validation webhook.
- `clip-studio/src/lib/n8n-client.ts` — new `validateYoutubeCookie()` using the existing `callWebhook()` helper (same `AppConfig.n8nIngestWebhookUrl`/shared-secret pattern already used by `triggerIngestion` etc.).
- **n8n workflow (production, via MCP):** a new small webhook-triggered workflow — Webhook Trigger → Execute Command (the `yt-dlp --simulate` probe against `youtube-cookies.master.txt`, same command already documented in `harden-youtube-cookie-refresh-validation/design.md`) → respond with a structured pass/fail result. This is the one piece of this change that touches production n8n directly (via MCP `update_workflow`/`publish_workflow`), separate from Clip Studio's own codebase — flagged explicitly since prior sessions have paused before touching production n8n without a clear go-ahead (see `clip-studio/deploy/README.md` §3's precedent for Clip Studio's other n8n-side webhook workflow).
- No change to `cookie-refresher` itself, to the pipeline's download step, or to `youtube-cookie-auth`'s existing requirements — this only adds a self-service front door to `/bootstrap` plus a validation step that already existed as a manual procedure.
