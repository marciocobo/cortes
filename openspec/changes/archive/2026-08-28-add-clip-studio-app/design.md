## Context

See `proposal.md` - Why / What Changes for motivation. Relevant constraints from the existing project:
- The n8n "Blocos" workflow (`ID4wisnN4Tqpt2zh`) discovers work by scanning the root of the `Videos-Cortes` OneDrive folder for video files ≥1MB, locks itself with a file-based lock (`/home/node/.n8n-files/.processing.lock`, 8h expiry) so only one video processes at a time, moves the original to `Videos-Cortes/Videos` on success, and writes clips + `_meta.json` to `Videos-Cortes/Cortes`. This change must not modify any of that — it only feeds it a new video the same way a manual OneDrive sync already does today.
- `VPS.md` documents the actual target infrastructure: a single Contabo VPS (Ubuntu 24.04, 6 vCPU, 17GiB RAM) already running n8n (`n8n-n8n-1`, on the `n8n_default` Docker network) plus two other apps (NutriFlow, GarantIA) as sibling Docker Compose stacks, all fronted by one shared Caddy container that routes by domain (`Caddyfile` in `/root/n8n`). Each existing app follows the same pattern: its own Postgres container, joined to `n8n_default` for the public route plus its own internal network for its private services, and a Caddyfile entry (`<subdomain>.mcobo.com.br` → `<container>:<port>`).
- n8n's whisper.cpp/ffmpeg processing already happens as `Execute Command` calls **inside the `n8n-n8n-1` container**, which the project's own history (`CLAUDE.md`) established runs a hardened Alpine image (no `curl`, no `python3` — only `wget`, `node`, and whatever static binaries are placed on its writable volume, `/home/node/.n8n-files/`). Any new command run from an n8n node inherits that same constraint.
- The user confirmed the stack for the Clip Studio app itself: Next.js (App Router) with Node.js API routes, Postgres for persistence — deployed as a new Docker Compose stack on this same VPS, following the NutriFlow/GarantIA pattern.
- The user confirmed, after seeing `VPS.md`, that the YouTube-link download should **not** live in the Clip Studio backend. Instead: a **new, separate n8n workflow** (not a change to "Blocos") does the `yt-dlp` download and the OneDrive upload, because n8n already holds a working OneDrive OAuth2 credential on this VPS and already has the `wget`/`Execute Command` pattern for exactly this kind of I/O. The user also specified the sequencing explicitly: as links are submitted, they are downloaded and placed into `Videos-Cortes` **one at a time, in submission order** ("como é feito hoje" — as if synced in manually one by one), and each successful download should trigger the "Blocos" pipeline to pick up the queue, rather than waiting for its 6-hour schedule trigger.

## Goals / Non-Goals

**Goals:**
- Real auth, roles, and data (Postgres) replacing every mock in the prototype.
- A YouTube-link submission flow whose actual video acquisition happens inside n8n (new workflow), not inside the Next.js app, reusing n8n's existing OneDrive credential instead of provisioning a second one.
- Sequential, queued downloads (one `yt-dlp` at a time) so ingestion never competes with itself — or with the "Blocos" pipeline's own whisper.cpp/ffmpeg load — for the VPS's 6 vCPUs.
- A video library that reads clip metadata the pipeline already produces, so nothing has to be re-derived or duplicated by Clip Studio.
- Deploy Clip Studio on the existing Contabo VPS using the same Docker Compose + Caddy + per-app Postgres pattern already used by NutriFlow and GarantIA, so it is operated the same way everything else on this VPS already is.
- Carry forward the prototype's validated UX (roles, sidebar nav, responsive breakpoints) and fix its one known defect (clip-trim screen not fitting small/large viewports) — the clip-trim ("Cortar") screen is back in scope for this change (see "Manual clip trimming" decision below), so this fix now applies directly.
- Let a Clipador (or Admin) manually re-cut (trim the start/end of) a clip already produced by the pipeline, matching the prototype's "Cortar vídeo" modal, without touching the "Blocos" pipeline itself.

**Non-Goals:**
- Any change to the existing "Blocos" workflow's nodes, prompts, or thresholds — the new ingestion workflow only *triggers* it (fire-and-forget), exactly like the existing self-chaining pattern already does between videos.
- Multi-tenant/organization support — this is a single-organization internal tool, matching the prototype's scope.

## Decisions

### Data model & ORM
Use Prisma with Postgres. Core tables: `User` (id, email, passwordHash, role enum [`CLIPADOR`,`UPLOADER`,`ADMIN`], active boolean), `Submission` (id, youtubeUrl, title, submittedById → User, status enum [`FILA`,`BAIXANDO`,`PROCESSANDO`,`CONCLUIDO`,`ERRO`], errorReason, uploadedFileName, createdAt, updatedAt), `AppConfig` (single-row key/value: the n8n ingestion webhook URL + shared secret, and any future admin-configurable setting). Clips themselves are **not** duplicated into Postgres — the video library reads live from OneDrive on each request (see next decision), so there is no sync/consistency problem between a Postgres clip table and what the pipeline actually produced.
- Alternative considered: mirror clip metadata into Postgres on a schedule. Rejected for v1 — adds a sync job and a new failure mode (stale mirror) for no benefit at this data volume (tens of clips per video, a handful of videos per week).

### Clip Studio never talks to Microsoft Graph directly
Every OneDrive interaction — listing/reading clips for the video library, renaming, deleting, and now downloading+uploading a submitted YouTube video — is delegated to n8n, which already has a working OneDrive OAuth2 credential on this VPS. Clip Studio's backend calls a small family of n8n **webhook-triggered utility workflows** instead of holding its own Microsoft Graph app registration:
- `POST /webhook/clip-studio/ingest` — body `{submissionId, youtubeUrl, title}` → new ingestion workflow (see below).
- `GET /webhook/clip-studio/clips` → lists `Videos-Cortes/Cortes`, pairs each `.mp4` with its `_meta.json`, returns name/duration/thumbnail URL/`@microsoft.graph.downloadUrl` per clip.
- `POST /webhook/clip-studio/clips/rename` — body `{itemId, newName}`.
- `POST /webhook/clip-studio/clips/delete` — body `{itemId}` (deletes both `.mp4` and `.json`).
- `POST /webhook/clip-studio/clips/trim` — body `{itemId, newStartSec, newEndSec}` → re-cuts the clip's own `.mp4` in place (see "Manual clip trimming" decision below).
All webhook calls are authenticated with a shared secret (an n8n webhook auth header), configured once and stored server-side only — never shipped to the browser.
- Alternative considered (this change's original design): a dedicated Azure AD app registration + Graph API client inside the Next.js backend. Rejected after the user pointed at `VPS.md` — it duplicates a credential n8n already has, adds a second OAuth consent to maintain, and was only chosen originally because the ingestion path hadn't yet been moved into n8n. Routing every OneDrive call through n8n removes an entire category of new infrastructure from this change.

### New n8n workflow: YouTube ingestion (separate from "Blocos")
A new, independent n8n workflow — **not** a modification of `ID4wisnN4Tqpt2zh` — owns the YouTube → OneDrive step:
1. **Webhook trigger** receives `{submissionId, youtubeUrl, title}` from Clip Studio, responds immediately (n8n "Respond to Webhook" set to *immediately*, not waiting for the workflow to finish) so Clip Studio's request doesn't block for the whole download.
2. **Execute Command**: runs a static `yt-dlp` binary (downloaded once to the same writable volume pattern already used for the whisper model, `/home/node/.n8n-files/yt-dlp`, `chmod +x` — no `python3`/`pip` needed, matching the Alpine-hardened, minimal-tools constraint already documented for this container) to fetch the video to a temp path.
3. On success: uploads the file into `Videos-Cortes` (root) via the same OneDrive node/credential pattern the "Blocos" workflow already uses elsewhere, using a collision-safe file name that embeds `submissionId` so it can never collide with another submission's title.
4. **Calls back** to Clip Studio (`POST` to an internal Clip Studio API route, e.g. `/api/webhooks/n8n/ingestion`) with `{submissionId, status: 'PROCESSANDO' | 'ERRO', errorReason?}` — this is the only new inbound integration Clip Studio needs; it replaces polling entirely for the download step.
5. On success, **fires** the existing "Blocos" workflow (`execute_workflow`, `waitForSubWorkflow:false` — the same fire-and-forget pattern the self-chaining feature already uses between videos) so the newly-dropped video is picked up immediately instead of waiting for the 6-hour schedule trigger. This is safe to call even if "Blocos" is already processing another video: its own lock (`Verificar Trava de Execução` / `Aplicar Trava` / `Trava Liberada?`) already handles a busy collision as a normal, non-error outcome (fixed 29/07/2026) — it simply no-ops until the running video finishes and its own self-chaining picks up the queue.
- Alternative considered: have the ingestion workflow wait synchronously for "Blocos" to fully finish that video before responding. Rejected — "Blocos" runs for 1-5+ hours; the point of triggering it is only to avoid an idle wait until the next schedule tick, not to report final clip status back through this call.

### Sequential download queue (Clip Studio-owned)
The user was explicit that submissions must download **one at a time, in order**, landing in OneDrive in sequence "como é feito hoje" (as if manually synced one by one) — not run `yt-dlp` concurrently for multiple links, which would compete with the pipeline's own whisper.cpp/ffmpeg load on the same 6-vCPU VPS. Clip Studio's backend owns this queue, not n8n:
- A submission is created with status `FILA` (queued) the moment the Uploader submits it.
- A single backend dispatcher processes `FILA` submissions FIFO: it calls the ingestion webhook for the oldest queued submission, marks it `BAIXANDO`, and does **not** dispatch the next one until it receives the ingestion workflow's callback (step 4 above) for the current one.
- If the callback reports `ERRO`, the dispatcher records the error and immediately moves on to the next queued submission (a failed download must not block the queue).
- Alternative considered: implement the queue/lock inside n8n itself (a second file-lock, mirroring `.processing.lock`). Rejected — Clip Studio already needs a `Submission` table with a status machine to drive the UI; enforcing "one dispatch in flight" there is simpler than adding another lock file and its own 8h-expiry edge cases to the ingestion workflow.

### Manual clip trimming (re-cut an already-generated clip)
Matches the prototype's "Cortar vídeo" modal (per-clip button, alongside Renomear/Baixar/Excluir on each card): a Clipador drags an Início/Fim slider over the clip's *own* current duration (0 to the clip's existing length — this can only shorten an already-produced clip, not pull in more of the original video) and saves.
- Like every other OneDrive mutation in this design, Clip Studio does not run FFmpeg itself — a new n8n utility webhook (`POST /webhook/clip-studio/clips/trim`, same workflow as the other utility webhooks) does the work: download the clip's current `.mp4` from OneDrive to the writable volume, run `ffmpeg -i <in> -ss <newStartSec> -to <newEndSec> <out>` **with a full reencode**, not `-c copy` — copy-mode trimming only cuts on keyframe boundaries, which would silently ignore the second-level precision the sliders promise. This mirrors the "Blocos" pipeline's own reencode-based cutting (`FFmpeg Cortar 9:16`), just without the crop/scale/silence-snap logic, since this is a deliberate manual adjustment, not an AI-picked boundary.
- The re-cut file **overwrites the same OneDrive item** (same name/`itemId`), reusing the resumable-upload-session pattern already built for ingestion (task 2.4) rather than a new upload path.
- The clip's `_meta.json` is updated in the same call: `real_start`/`real_end` (or `start`/`end` if the `real_*` fields aren't present) are recomputed as `originalRealStart + newStartSec` / `originalRealStart + newEndSec` — i.e. still absolute offsets into the original source video, just narrowed — so any future audit (e.g. the `clipador` agent) keeps working against real timestamps. `hook`/`reason`/`block_score`/`criteria` are left untouched; an `edited: true` + `editedAt` field is added so a manually-trimmed clip is distinguishable from pipeline output in the metadata.
- Validation: reject `newStartSec >= newEndSec`, and reject either value outside `[0, currentClipDurationSec]` — surfaced back to the modal as an inline error, no partial write.
- Alternative considered: let the Clipador pick any range within the *original* source video (re-cutting from `Videos-Cortes/Videos`), which would allow expanding a clip, not just shortening it. Rejected for this pass — the original video isn't guaranteed to still exist (no retention policy was specified for `Videos-Cortes/Videos`), and the prototype's own modal only ever shows the clip's own preview/duration, not the full source. Revisit as a separate, larger change if expanding clips is needed later.

### Status after the download step
Once the ingestion workflow's callback marks a submission `PROCESSANDO`, Clip Studio has no further callback from "Blocos" itself (that workflow is intentionally untouched). A lightweight background poller checks OneDrive (via the `GET /webhook/clip-studio/clips`-style n8n utility, extended to also check `Videos-Cortes/Videos`) for each `PROCESSANDO` submission:
- If a file matching `uploadedFileName` now exists in `Videos-Cortes/Videos` (written by "Blocos"'s `Mover Vídeo Processado` node **after** all its clips are already uploaded to `Videos-Cortes/Cortes`), mark the submission `CONCLUIDO`.
- If a submission has been `PROCESSANDO` for longer than a configurable stuck-threshold (default 8h, matching "Blocos"'s own lock-expiry assumption) and the file is in neither `Videos-Cortes` nor `Videos-Cortes/Videos`, mark it `ERRO` with a "sem confirmação da esteira dentro do tempo esperado" reason.
- Alternative considered: extend "Blocos" itself with a callback node when it finishes a video. Deferred — see Open Questions; would remove the poller but does touch the pipeline the user asked to leave alone, so it's left as a future refinement rather than baked into this change.

### Auth
NextAuth (Credentials provider) backed by the `User` table, bcrypt password hashing, JWT session strategy (no extra session store needed). Role check happens in a shared server-side helper called from every API route and from route-level middleware for page access — never trusted from client state alone (per the `auth-rbac` spec's "API rejects unauthorized role" requirement).

### Deployment topology (per `VPS.md`)
Clip Studio ships as a new Docker Compose stack on the existing Contabo VPS, mirroring NutriFlow/GarantIA exactly:
- `clipstudio-web-1` (Next.js) + `clipstudio-postgres-1` (postgres:16-alpine, matching the version already used by the other two stacks), on a new internal network `clipstudio_internal`.
- `clipstudio-web-1` also joins the shared `n8n_default` network (with an alias) so the existing Caddy container can route to it — no new reverse proxy or TLS setup, just one new Caddyfile block (`clipstudio.mcobo.com.br` → `clipstudio-web:3000`) in `/root/n8n/Caddyfile`, the same edit already made for `nutrivion.mcobo.com.br`/`garantia.mcobo.com.br`.
- Postgres is **not** exposed publicly (same rule already documented in `VPS.md` §12 for the other stacks' databases) — internal network only.
- Secrets (Postgres credentials, NextAuth secret, the shared secret for the n8n webhook calls) live in a `.env` file for the stack, not committed, matching the `stack.env`/`.env` pattern already used by the other three apps on this VPS.

## Risks / Trade-offs

- **[Risk]** The ingestion workflow's callback to Clip Studio could itself fail transiently (network blip between the VPS's n8n container and the Clip Studio container, even though they're on the same host/network) → **Mitigation**: n8n's `retryOnFail` on the callback HTTP node (same pattern already used elsewhere in "Blocos" for OneDrive calls); if it still doesn't land, the `PROCESSANDO`/stuck-threshold poller (see above) is a fallback that eventually surfaces the state either way.
- **[Risk]** A submission that's still `PROCESSANDO` when the poller's stuck-threshold fires but is actually just slow (long video queued behind another one) gets prematurely marked `ERRO` → **Mitigation**: default threshold (8h) is already generous relative to the documented typical run time (1-5h); make it admin-configurable via `AppConfig` so it can be tuned without a redeploy.
- **[Risk]** Running `yt-dlp` inside the same n8n container that also runs whisper.cpp/ffmpeg for "Blocos" adds a new CPU/bandwidth consumer to an already resource-constrained 6-vCPU VPS → **Mitigation**: the Clip Studio-owned sequential queue (see above) guarantees at most one `yt-dlp` process at a time, and a download is comparatively light (network-bound, not CPU-bound like whisper.cpp) so it does not compete meaningfully with an in-progress transcription.
- **[Risk]** The static `yt-dlp` binary needs periodic updates (YouTube changes break older extractors faster than most tools) → **Mitigation**: document the update procedure (re-`wget` + `chmod +x`, same as the whisper model download procedure already documented in `CLAUDE.md`) as an operational note; no automatic self-update in scope for this change.
- **[Trade-off]** Post-download status still relies on polling (not a callback) because the "Blocos" workflow itself stays untouched — acceptable given pipeline runtimes are measured in hours, not seconds, so a polling interval of a few minutes is imperceptible in practice.

## Migration Plan

This is a new app with no prior production data, so there is no data migration. Deployment steps:
1. Build the new n8n ingestion workflow (webhook trigger, `yt-dlp` Execute Command, OneDrive upload reusing the existing credential, callback HTTP node, `execute_workflow` trigger into "Blocos") and the OneDrive utility webhooks (list/rename/delete) as one or more new workflows in the same n8n instance; publish them.
2. `wget` the static `yt-dlp` binary to `/home/node/.n8n-files/yt-dlp` on the VPS and confirm it runs inside the n8n container via a temporary Execute Command node (same diagnostic pattern already used in this project for permission/tooling checks).
3. Add the new Clip Studio Docker Compose stack (`clipstudio-web-1`, `clipstudio-postgres-1`) to the VPS, run Prisma migrations, seed one initial Admin account.
4. Add the `clipstudio.mcobo.com.br` block to `/root/n8n/Caddyfile` and reload Caddy.
5. Configure the shared webhook secret and the n8n webhook base URL in Clip Studio's `AppConfig`/env.
6. Smoke-test login for each role and one end-to-end submission against a short test YouTube video — confirm it queues, downloads, lands in `Videos-Cortes`, triggers "Blocos", and the video library eventually shows the resulting clips — before announcing it to real users.
7. Rollback: since Clip Studio doesn't touch "Blocos" itself, rollback is stopping the `clipstudio-*` containers and removing the Caddyfile block; the existing manual OneDrive-drop workflow keeps working unaffected. The new ingestion workflow can be left published but unused (it only runs on webhook calls Clip Studio would no longer make).

## Open Questions

- Should "Blocos" itself later gain a completion callback (one new HTTP node) so Clip Studio can drop the `PROCESSANDO`→`CONCLUIDO` poller entirely? Deferred — the user asked to keep "Blocos" untouched for this change; revisit as a small, separate, low-risk change once the polling approach has run in production.
- Should the stuck-threshold default (8h) differ per video length/size, given the project's own data shows run time scales with video duration? Deferred — start with a single admin-configurable value and revisit if it causes visible false-`ERRO`s.
