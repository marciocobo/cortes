## 1. n8n workflow (production, requires separate go-ahead before starting)

- [x] 1.1 Confirm with the user before touching production n8n (per design.md's explicit flag) — do not start 1.2+ without that confirmation.
- [x] 1.2 Build the new webhook workflow via MCP: Webhook Trigger (`clip-studio/youtube-cookie/validate`, `X-Clip-Studio-Secret` header auth) → Execute Command (the `yt-dlp --simulate` probe from design.md) → Code node parsing pass/fail → Respond to Webhook with `{"ok": true|false, "detail": "..."}`. Built as workflow `P4Zc315xsGjg3LuM` ("Validar Cookie YouTube"), credential `httpHeaderAuth` auto-assigned to the existing "Header Auth account" credential (same one the other Clip Studio webhooks use).
- [x] 1.3 Publish the workflow; confirm the webhook path resolves under the existing `AppConfig.n8nIngestWebhookUrl` base (same as `clip-studio/ingest`). Published (`activeVersionId: 3cbc5e96-45a9-4b33-bf32-6be7ca8a3c66`).
- [x] 1.4 Manually trigger it once (a known-good and a known-broken cookie state) to confirm the pass/fail parsing matches the manual procedure's success criterion exactly. Tested against the current (known-dead) cookie: `{"ok":false,"detail":"...cookies are no longer valid...[info] dQw4w9WgXcQ: Downloading 1 format(s): 401+140"}` — correctly `ok:false` despite a trailing format-selection line, because the "cookies are no longer valid" warning is present, matching the manual criterion's "no WARNING...cookies are no longer valid" requirement exactly (not just "did a format line appear"). A known-good confirmation will happen naturally on the first real re-bootstrap through the new UI (task 4.3).

## 2. Clip Studio backend

- [x] 2.1 Add `validateYoutubeCookie()` to `clip-studio/src/lib/n8n-client.ts` using the existing `callWebhook()` helper, path `clip-studio/youtube-cookie/validate`.
- [x] 2.2 Add `clip-studio/src/app/api/admin/youtube-cookie/route.ts`: `POST` handler, `requireAdmin()`, validates non-empty body, forwards to `http://cookie-refresher-1:4600/bootstrap`, returns its `reason` immediately if `ok:false`, otherwise calls `validateYoutubeCookie()` and returns that result.

## 3. Clip Studio UI

- [x] 3.1 Add a new section to the Configurações screen (alongside `N8nConfigForm.tsx`) with a textarea for pasting `cookies.txt` content and a submit button.
- [x] 3.2 Wire submit to `POST /api/admin/youtube-cookie`; show validating/success/failure states with the specific `reason`/`detail` on failure.

## 4. Verification

- [x] 4.1 `tsc --noEmit` and `eslint` on changed files.
- [x] 4.2 Deploy Clip Studio changes per `clip-studio/deploy/README.md` (with user permission, per this project's standing rule for touching the VPS).
- [x] 4.3 End-to-end verify against `clipstudio.mcobo.com.br`: submit a real fresh `cookies.txt` as Admin, confirm the consolidated result matches what a manual bootstrap+validate would show; confirm a Clipador/Uploader cannot reach the endpoint. User confirmed: validated a fresh cookie via the new Admin screen, then submitted a real YouTube link through "Enviar Vídeo" and it downloaded/processed successfully — full end-to-end confirmation, using the same `youtube-cookies.master.txt` the re-bootstrap wrote.
- [x] 4.4 Once confirmed working, note in `harden-youtube-cookie-refresh-validation`'s design.md that candidate 3 has shipped, closing that open question.
