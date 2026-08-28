## Why

Today the shorts pipeline (`n8n-video-silence-cutter.html` → workflow `ID4wisnN4Tqpt2zh`) only starts when a video is manually synced into the `Videos-Cortes` OneDrive folder, and its output (cut clips + `_meta.json`) can only be reviewed by opening OneDrive by hand — there is no screen for anyone to submit a video, watch it process, or manage the resulting clips. A navigable prototype ("Clip Studio", built in Claude Design) already validated the screens and role model with the user across several rounds of feedback. This change turns that validated prototype into a real, deployed web app with 3 real user roles (Clipador, Uploader, Admin), backed by a real database and a real trigger into the existing n8n pipeline — replacing "drop a file in OneDrive and hope" with an actual product surface.

## What Changes

- New Next.js web app ("Clip Studio") with credentials-based login and 3 roles: **Clipador** (manage/edit/delete generated clips), **Uploader** (submit a YouTube link to kick off processing), **Admin** (both of the above, plus configuration).
- **Uploader flow**: paste a full YouTube video link + title → a new, separate n8n workflow (not a change to the existing "Blocos" pipeline) downloads it via `yt-dlp` and uploads the file into the same `Videos-Cortes` OneDrive folder the "Blocos" workflow already watches, then triggers "Blocos" to pick it up immediately instead of waiting for its schedule. Submissions download **one at a time, in order** — Clip Studio queues them rather than running downloads concurrently. A submission history table shows status per video (`Na fila` → `Baixando` → `Processando` → `Concluído` / `Erro`), reflecting real pipeline state instead of the prototype's fake timers.
- **Clipador flow**: video library styled like YouTube (thumbnail, name, duration) sourced from the clips already produced by the n8n pipeline (`Videos-Cortes/Cortes`, one entry per `_meta.json`); rename, delete, download, and manually re-cut (trim start/end within the clip's own current duration) each clip. **BREAKING (from the prototype)**: no upload-by-file feature — the prototype's mock "upload a file directly" path is dropped since real videos always originate from the Uploader → YouTube → n8n path, never a direct file upload by the Clipador.
- **Admin flow**: everything Clipador and Uploader can do, plus user/role management (create/deactivate users, assign role) and the N8N webhook/notification configuration screen.
- Auth, roles, users, video/submission records persisted in Postgres — no more fake/mock login.
- Responsive layout (desktop + mobile), carrying forward the prototype's fixed sidebar nav (collapses to a top bar on narrow screens) and fixing the prototype's known bug where the clip-trim screen didn't fit small viewports.

## Capabilities

### New Capabilities
- `clip-studio/auth-rbac`: user accounts, credentials login, session management, and the 3-role (Clipador/Uploader/Admin) permission model gating every other capability below.
- `clip-studio/video-library`: the Clipador-facing library of generated clips (list styled like YouTube, rename, delete, download, manual trim/re-cut), sourced from the n8n pipeline's OneDrive output.
- `clip-studio/youtube-ingestion`: the Uploader-facing flow to submit a YouTube link, the sequential download queue, the handoff (via a new n8n workflow) to the existing pipeline, and the submission history/status tracking shown on screen.
- `clip-studio/admin-console`: Admin-only user/role management and N8N configuration (webhook/notification settings), plus Admin's blanket visibility into all videos and submissions across every user.

### Modified Capabilities
(none — the existing n8n pipeline capabilities in `openspec/specs/` are not changing; Clip Studio is a new consumer/producer sitting in front of the same OneDrive folder, not a modification to how the pipeline itself works)

## Impact

- **New code**: a full Next.js app (frontend + API routes) — does not exist in this repo today, which currently only contains the n8n workflow generator (`n8n-video-silence-cutter.html`) and its JSON exports.
- **New infrastructure, all on the existing Contabo VPS documented in `VPS.md`**: a new Docker Compose stack (`clipstudio-web-1` + `clipstudio-postgres-1`) joined to the shared `n8n_default` network, a new Caddyfile route (`clipstudio.mcobo.com.br`), and a static `yt-dlp` binary placed on the n8n container's writable volume (`/home/node/.n8n-files/`) — no separate hosting provider or Graph API app registration needed.
- **New n8n workflow** (separate from `ID4wisnN4Tqpt2zh`/"Blocos"): a webhook-triggered ingestion workflow that runs `yt-dlp`, uploads to `Videos-Cortes` via n8n's existing OneDrive credential, calls back to Clip Studio, and fires "Blocos" (fire-and-forget) so it picks up the new video immediately. n8n also gains small utility webhooks (list/rename/delete/trim clips) so Clip Studio never needs its own Microsoft Graph credentials.
- **No changes to the "Blocos" workflow itself** (`ID4wisnN4Tqpt2zh`, `workflow-blocos.json`, `n8n-video-silence-cutter.html`) — its nodes, trigger, and fallback/lock logic documented in `CLAUDE.md` are untouched; the new ingestion workflow only feeds it a video and pings it to start, the same way a manual OneDrive sync + the 6-hour schedule trigger already do today.
- **Design source**: the Claude Design prototype at `claude.ai/design/p/158ef6ee-85af-48c5-9823-320e20981bcf` (file `Clip Studio.dc.html`) is the UX reference for screens, copy, and the responsive sidebar layout; it is a mock-data prototype only (fake login, simulated status transitions, direct file upload) and this change replaces every one of those mocks with the real behavior described above.
