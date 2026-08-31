# Deploying `cookie-refresher`

Target: the same Contabo VPS documented in `VPS.md`, alongside n8n/Clip
Studio/NutriFlow/GarantIA. See
`openspec/changes/add-youtube-cookie-refresher/` (proposal/design/specs)
for the full rationale — this file only covers the operational steps.

## What this service is for

The "Clip Studio — Integração N8N" ingestion workflow downloads YouTube
videos with `yt-dlp`, which needs a valid YouTube session cookie
(`/home/node/.n8n-files/youtube-cookies.master.txt` inside the n8n
container) to avoid YouTube's "Sign in to confirm you're not a bot" check.
That cookie previously had to be re-exported from a browser and copied onto
the VPS by hand every time the session rotated (see
`clip-studio/deploy/README.md` §4 for the old, fully-manual procedure).
`cookie-refresher` automates the *re-export*, not the login — see "No
automated login" below for why.

## 1. First-time deploy

```bash
# On the VPS, as root:
cd /root
git clone <this repo> cookie-refresher   # or scp the cookie-refresher/ directory
cd cookie-refresher
docker compose -f deploy/docker-compose.yml up -d --build
```

This mounts `/root/n8n/n8n_files` (the same host directory the n8n
container already bind-mounts as `/home/node/.n8n-files`) into the new
container at `/data`, and joins the existing `n8n_default` network so the
ingestion workflow can reach it at `http://cookie-refresher-1:4600`.

At this point the service is running but its browser profile has never
been logged in — every `/refresh` call will return
`{"ok":false,"reason":"sessao_expirada_precisa_login_manual"}` until step 2.

## 2. One-time (or rare re-login) profile setup

This step is **deliberately manual** — see design.md's "No automated login"
decision: automating a real Google username/password (+ 2FA) login is what
we're avoiding, since it's exactly the kind of scripted-login pattern
Google's own anti-automation detection is tuned to catch.

Instead, bootstrap the profile from a cookies.txt export — the same manual
step already documented in `clip-studio/deploy/README.md` §4, just needed
far less often afterward:

1. On a machine logged into the YouTube account to use, export cookies in
   Netscape format while on `youtube.com` (e.g. the "Get cookies.txt
   LOCALLY" browser extension).
2. POST that file's raw content to the bootstrap endpoint (internal-only —
   run this from inside the VPS, or via an SSH tunnel to `n8n_default`):
   ```bash
   curl -X POST --data-binary @cookies.txt http://localhost:4600/bootstrap \
     # (from inside the cookie-refresher container's network namespace, or
     #  after an `ssh -L 4600:cookie-refresher-1:4600 root@<vps>` tunnel)
   ```
3. Confirm the response is `{"ok":true,"cookieCount":N}` with `N > 0`, and
   that `/root/n8n/n8n_files/youtube-cookies.master.txt` now exists,
   `chown 1000:1000`, `chmod 400`.
4. **Mandatory — do not stop at step 3.** `{"ok":true}` only means the
   cookie *looked* logged-in to the Playwright profile; it does not prove a
   real `yt-dlp` download will work (confirmed the hard way on 2026-08-31 —
   see `openspec/changes/harden-youtube-cookie-refresh-validation/`, a
   bootstrap reported `ok:true` and the very next download still failed
   with a rotated-cookie error). Validate end-to-end before considering the
   incident closed:
   ```bash
   docker exec n8n-n8n-1 sh -c '
     cp /home/node/.n8n-files/youtube-cookies.master.txt /tmp/test-cookies.txt
     chmod 600 /tmp/test-cookies.txt
     /home/node/.n8n-files/yt-dlp --no-playlist --cookies /tmp/test-cookies.txt \
       --js-runtimes node:/usr/local/bin/node --simulate \
       -f "bestvideo[height>=2160][ext=mp4]+bestaudio[ext=m4a]/best" \
       "https://www.youtube.com/watch?v=<VIDEO_ID>" 2>&1 | tail -30
     rm -f /tmp/test-cookies.txt
   '
   ```
   Only trust the fix once this prints a real `[info] ...: Downloading N
   format(s): ...` line, with **no** `ERROR: ... Sign in to confirm` and
   **no** `WARNING: ... cookies are no longer valid`. If it still fails,
   re-export `cookies.txt` immediately (close other tabs/windows logged
   into that YouTube account first, to reduce the chance the `SIDCC`-family
   cookies rotate again before you finish) and repeat from step 2 — don't
   assume a second bootstrap will succeed just because the first one's
   response looked fine.

From this point on, `/refresh` (called by the daily cron and by the n8n
workflow's retry logic) keeps the same persistent profile alive without
ever repeating this step — until the underlying Google session actually
dies for good, which should be far rarer than the previous per-download
cookie rotation. **In practice (as of 2026-08-31) the session can still go
stale unattended within about a day**, so treat step 4's validation as
something to re-run proactively, not just after a reported failure, until
the permanent automated fix (tracked in
`openspec/changes/harden-youtube-cookie-refresh-validation/`) lands.

## 3. Failure modes to recognize

- **`{"ok":false,"reason":"sessao_expirada_precisa_login_manual"}`** — the
  persistent profile's session has fully expired (not just a rotated
  cookie the refresh could fix). Requires repeating step 2 above with a
  fresh export. This is the *only* case that needs a human.
- **`{"ok":false,"reason":"refresh_ja_em_andamento"}`** — a refresh was
  already in flight when another was requested (the cron and a reactive
  retry overlapped); safe to ignore, the in-flight one will complete.
- **`{"ok":false,"reason":"cookies_txt_vazio_ou_formato_invalido"}`**
  (bootstrap only) — the pasted file wasn't a valid non-empty Netscape
  cookies.txt; re-export and retry step 2.
- Anything else (`erro_inesperado`) — check `docker logs cookie-refresher-1`;
  most likely a Playwright/Chromium-level failure (e.g. YouTube changed its
  DOM enough to break the logged-in detector in `src/refresh.js`).

## 4. Verifying it's internal-only

```bash
docker compose -f deploy/docker-compose.yml config | grep -i ports   # expect no output
grep -i cookie-refresher /root/n8n/Caddyfile                         # expect no output
```

No Caddy route and no published port means `/refresh` and `/bootstrap` are
only reachable from containers on `n8n_default` — never from the public
internet.
