# Deploying Clip Studio

Target: the Contabo VPS documented in `VPS.md`, alongside n8n/NutriFlow/GarantIA.

An SSH key dedicated to this (`clipstudio_deploy`, ed25519) was set up on
2026-08-26 for Claude Code to reach the VPS directly as `root` - it was used
to place the YouTube cookies file (see §4) and can be reused for future
deploy-adjacent tasks. The user is doing the actual app deploy via git
themselves.

## 1. First-time setup

```bash
# On the VPS, as whatever user already deploys the other stacks:
cd /root
git clone <this repo> clip-studio   # or scp the clip-studio/ directory
cd clip-studio/deploy
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and AUTH_SECRET (openssl rand -base64 32)

docker compose --env-file .env up -d --build
docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed   # prompts via env - see below
```

The seed script (`prisma/seed.ts`) reads `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
from the environment and refuses to run without a password set - pass them
inline for the one-off seed command, e.g.:

```bash
docker compose exec -e SEED_ADMIN_EMAIL=admin@studio.com -e SEED_ADMIN_PASSWORD='...' web npm run db:seed
```

## 2. Caddy route

Add the block in `CADDYFILE_SNIPPET.txt` to `/root/n8n/Caddyfile` and reload
Caddy (see that file for the exact command). `clipstudio-web-1` doesn't need
a published port - it's reached by container name on the shared
`n8n_default` network, the same way `nutriflow-web`/`garantia-api` already are.

## 3. n8n side (see the "Clip Studio — Integração N8N" workflow)

This is a **separate workflow** from "Blocos", built and largely wired up
already (OneDrive credential attached, chunked-upload logic validated live
against production OneDrive in this session). Two things still need a human
in the n8n UI, because the MCP tooling used to build it cannot create
credentials:

1. **Create an "HTTP Header Auth" credential** in n8n (Credentials → Add
   Credential → Header Auth), e.g. named "Clip Studio Webhook Secret", with
   header name `X-Clip-Studio-Secret` and a value you generate yourself
   (treat it like a password). This is used both ways: n8n uses it to
   authenticate inbound calls from Clip Studio (all 5 webhook trigger
   nodes), and Clip Studio uses the *same* value as the outbound header
   when it calls n8n and when n8n calls Clip Studio's callback route.
2. **Enter that same secret, plus the webhook base URL
   (`https://n8n.mcobo.com.br/webhook`), in Clip Studio's own Configurações
   screen** (Admin-only) once the app is deployed and you can log in.

After the credential exists, ask Claude Code to wire it into the 5 webhook
trigger nodes and the 2 callback HTTP nodes via `setNodeCredential`, replace
the placeholder Clip Studio callback URL in the "Callback Sucesso"/"Callback
Erro" nodes with the real deployed URL
(`https://clipstudio.mcobo.com.br/api/webhooks/n8n/ingestion`), and publish
the workflow.

## 4. YouTube bot-detection on this VPS's IP — resolved (cookies + Node.js)

Tested live in this session with the `yt-dlp_musllinux` binary against a
real, unrestricted public video: YouTube returned **"Sign in to confirm
you're not a bot"** even with `--extractor-args "youtube:player_client=
android,web_safari"` (a common workaround). This looked like the VPS's IP
being flagged as a datacenter IP by YouTube's anti-bot system, not a bug in
the ingestion workflow itself. Two fixes were needed, both now live in the
"Baixar Video YouTube" node and **verified end-to-end against a real
download**:

1. **Cookies from a real, logged-in YouTube session.** The node auto-detects
   `/home/node/.n8n-files/youtube-cookies.txt` and adds `--cookies` when the
   file exists (falls back to running without it otherwise, so nothing was
   ever broken before the file existed). The file was exported from a
   browser (Netscape format, via a "Get cookies.txt LOCALLY"-style extension)
   and placed directly on the VPS via `scp` + `docker cp` into the n8n
   container — deliberately **not** through git (it's a live session
   credential, not a config value; see the earlier conversation for why).
   Owned `node:node`, mode `400` (read-only — see the mutation issue below),
   inside the container at `/home/node/.n8n-files/youtube-cookies.master.txt`.
2. **`--js-runtimes node:/usr/local/bin/node`.** With cookies in place,
   YouTube additionally required solving its "n" parameter JS challenge.
   yt-dlp's documented default runtime is Deno, but Deno only ships glibc
   builds — same musl incompatibility that broke the plain `yt-dlp_linux`
   binary in the first place (see §5). The fix: the n8n container already
   runs on Node.js (`/usr/local/bin/node`, confirmed v24.16.0) — pointing
   yt-dlp at that existing binary via `--js-runtimes` solves the challenge
   with zero new dependencies.

**Real incident (2026-08-26, same day): `yt-dlp` mutates the cookies file
it's pointed at.** `--cookies FILE` is documented as reading **and dumping**
the cookie jar back to that same file after every run — including failed
runs. The first real submission through the UI failed because several
diagnostic test runs during setup had each rewritten the file, shrinking it
from 25 lines to 18 and eventually breaking the exact cookies needed to
pass the bot check. Separately, the browser-exported cookies can also be
invalidated by Google itself within the same day if the source browser
session keeps being used normally (session token rotation) — that happened
too, on the same first attempt, requiring a fresh export. **Fix:** the
"Baixar Video YouTube" node now keeps a **read-only master**
(`youtube-cookies.master.txt`, mode `400` — yt-dlp literally cannot write to
it) and copies it to a per-submission scratch file
(`.cookies-{submissionId}.txt`, mode `600`, deleted after the run) that
`--cookies` actually points at. yt-dlp is free to mutate the scratch copy;
the master is never touched. Verified live: after this fix, the master
stayed at 27 lines through a full real 4K download (4.15GB, `tK2Ex5wo4mU`).

**Known trade-off (2026-08-26), superseded 2026-08-27 by `cookie-refresher`
(see below):** cookies still expire/get invalidated and need periodic manual
refresh, and this uses a real Google account's session for automated
downloads — keep volume reasonable. The node's format selection matches the
user's own manual `yt-dlp` preset (4K-first, mp4, embedded
thumbnail/metadata): `bestvideo[height>=2160][ext=mp4]+bestaudio[ext=m4a]/
.../bv*+ba/b`, plus `--embed-thumbnail --add-metadata`.

**Manual cookie refresh no longer needed in the common case (2026-08-27).**
Confirmed live in production on 2026-08-27 that the manual refresh below was
a real, recurring problem, not a hypothetical one (execution #602, a real
Uploader submission, failed with `Sign in to confirm you're not a bot`
because the master cookie had already gone stale). Fixed with a new
standalone service, `cookie-refresher/` (repo root, sibling to
`clip-studio/`) — see `cookie-refresher/deploy/README.md` and
`openspec/changes/add-youtube-cookie-refresher/` for the full design. In
short: it holds one persistent, already-authenticated Chromium profile and
periodically re-exports its current session cookies directly to
`youtube-cookies.master.txt`; the `Baixar Video YouTube` node here now also
calls it reactively (via `POST http://cookie-refresher-1:4600/refresh`) and
retries once whenever it hits the exact bot-check failure signature — see
that node's `command` parameter. **The manual steps below are now only
needed for the profile's one-time (or rare re-login) setup — see
`cookie-refresher/deploy/README.md` §2 — not for routine refreshes.**

**One-time (or rare re-login) profile setup, via `cookie-refresher`:**
1. On a machine logged into the YouTube account to use, export cookies in
   Netscape format (e.g. the "Get cookies.txt LOCALLY" browser extension —
   must be on youtube.com, logged in, when exporting; a file with only a
   few lines / no `.youtube.com` entries means it exported empty).
2. POST that file's content to `cookie-refresher`'s bootstrap endpoint
   instead of copying it directly into the n8n container — see
   `cookie-refresher/deploy/README.md` §2 for the exact command and how to
   confirm it worked.

The old direct-copy procedure (export → `scp` → `docker cp` straight into
`youtube-cookies.master.txt`) still works as a manual fallback if
`cookie-refresher` itself is down, but should not be needed routinely
anymore:
   ```bash
   scp cookies.txt root@109.123.250.135:/tmp/youtube-cookies-master.txt
   ssh root@109.123.250.135 "docker exec -u root n8n-n8n-1 rm -f /home/node/.n8n-files/youtube-cookies.master.txt && \
     docker cp /tmp/youtube-cookies-master.txt n8n-n8n-1:/home/node/.n8n-files/youtube-cookies.master.txt && \
     docker exec -u root n8n-n8n-1 sh -c 'chown node:node /home/node/.n8n-files/youtube-cookies.master.txt && chmod 400 /home/node/.n8n-files/youtube-cookies.master.txt' && \
     rm -f /tmp/youtube-cookies-master.txt"
   ```

None of this blocks deploying the rest of Clip Studio (video library, auth,
admin console all work independently of ingestion) - it specifically affected
the Uploader → YouTube step, which is now confirmed working end-to-end at
the `yt-dlp` level, including a real 4K download while the webhook → OneDrive
upload → callback chain (published, credential wired) was validated
separately through the real video library (216 real clips rendering
correctly). The one thing not yet run is a submission through the actual
Clip Studio UI with the current (working) cookies — do that next.

## 5. yt-dlp binary maintenance

YouTube changes break yt-dlp's extractors faster than most tools. To update
the binary already installed at `/home/node/.n8n-files/yt-dlp` inside the
n8n container (same pattern as the whisper model download procedure already
documented in `CLAUDE.md`), run via a temporary Execute Command node (or ask
Claude Code to do it through the n8n MCP, the same way it was installed):

```bash
wget -q --tries=5 --waitretry=5 -O /home/node/.n8n-files/yt-dlp \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_musllinux
chmod +x /home/node/.n8n-files/yt-dlp
/home/node/.n8n-files/yt-dlp --version
```

Use `yt-dlp_musllinux` specifically - this VPS's n8n container runs Alpine
(musl libc), and the plain `yt-dlp_linux` build (glibc-linked PyInstaller
binary) fails to start here with a Python shared-library relocation error.

## 6. Smoke test

Once deployed: log in with the seeded Admin account, confirm the video
library loads (even if empty), and try a submission end-to-end once the
YouTube bot-detection question above is resolved one way or another.
