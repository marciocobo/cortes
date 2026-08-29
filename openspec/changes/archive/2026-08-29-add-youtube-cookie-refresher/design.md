## Context

See `proposal.md` — Why. Relevant constraints already established in this project (`CLAUDE.md`):
- The n8n container runs on an Alpine "Docker Hardened Image" — deliberately minimal (`sh`, `wget`, coreutils only; no `curl`, `python3`, `bash`). Installing Playwright/Chromium directly into that image would fight the container's purpose.
- The project's established pattern for adding heavier, unrelated functionality is a **new sibling Docker Compose service** joined to the shared `n8n_default` network (exactly how Clip Studio itself was deployed), not bolting more into an existing container.
- The `Baixar Video YouTube` node already implements a master/scratch cookie pattern (`clip-studio/deploy/README.md` §4): a read-only master file (`/home/node/.n8n-files/youtube-cookies.master.txt`, `chown node:node`, `chmod 400`) is copied to a per-submission scratch file before every `yt-dlp` run and deleted after, specifically because `yt-dlp --cookies FILE` rewrites the file it reads — this design writes to that same master path/ownership/permissions and does not change or duplicate that existing scratch-copy mechanism.
- `--extractor-args "youtube:player_client=android,web_safari"` was already tried on this exact VPS IP during initial ingestion setup and did not avoid the bot-check (same README) — not a viable mitigation here, so it is out of scope for this design.

## Goals / Non-Goals

**Goals:**
- Eliminate the recurring manual toil (SSH in, re-export cookie in a browser, `docker cp`) every time the session rotates.
- Keep the blast radius of automation small: the only thing ever automated is "revisit a page with an existing logged-in session and export current cookies," never authentication itself.
- Make the common case (cookie stale but underlying session still alive) fully self-healing with zero human involvement.

**Non-Goals:**
- Not attempting to eliminate the need for a YouTube session credential entirely (research confirmed no current open-source approach reliably does this — see proposal.md).
- Not building general-purpose browser automation infrastructure — this service does exactly one thing (hold a profile, export its cookies) and is not a target for scope creep into other scraping needs.
- Not automating recovery from a fully-expired underlying session (that remains an explicit, rare, manual step by design — see the "No automated login" requirement).

## Decisions

**Decision: separate Docker Compose service, not a script inside the n8n container.**
Alternative considered: install Playwright directly in the n8n container image. Rejected — contradicts the Alpine-hardened, minimal-dependency design already established for this container (see Context), and would mix an unrelated heavy dependency (Chromium, ~300MB+) into the same blast radius as the production pipeline container. A sibling service isolates the risk and mirrors the precedent set by Clip Studio's own deployment.

**Decision: persistent authenticated profile, refreshed by revisiting, never by re-login.**
Alternative considered: automate the full username/password (+ 2FA) login flow with Playwright on a schedule, so the profile never needs a human at all. Rejected — this is the single riskiest idea explored: Google's anti-automation detection is specifically tuned to catch scripted logins (CAPTCHA challenges, device-verification emails, temporary lockouts), so automating login would likely make the account *harder* to keep session-valid, not easier, and risks the account being flagged or locked outright. Revisiting an already-open session carries none of that risk — it looks identical to a browser tab someone forgot to close.

**Decision: write directly to the existing master cookie path (`/home/node/.n8n-files/youtube-cookies.master.txt`), preserving its ownership/permissions and the existing scratch-copy mechanism — not a new handoff mechanism.**
Alternative considered: have the ingestion workflow call the refresher and receive the cookie content directly in the webhook response, writing it itself. Rejected as unnecessary indirection — a shared Docker volume mount is simpler, requires no payload-size handling for a multi-KB cookie file over HTTP, and keeps `yt-dlp`'s invocation completely unaware that a refresher even exists (it just always reads the same master path, exactly as it already does today). The refresher must write the file as `node:node` / mode `400` (matching what the existing node expects) and must never touch the per-submission scratch files (`.cookies-{submissionId}.txt`) — those remain entirely the ingestion node's own concern.

**Decision: reactive retry is exactly one attempt, gated on the exact failure string.**
Alternative considered: retry on any `yt-dlp` failure. Rejected — most `yt-dlp` failures (network blip, video genuinely unavailable, region lock) have nothing to do with cookie staleness, and retrying all of them would mask real errors and waste time before the existing error-callback path reports the real problem to the Uploader. Matching the specific bot-check string keeps the retry targeted to the one failure mode it actually fixes.

**Decision: no `player_client` extractor-arg change in this design.**
Investigated as a candidate cheap mitigation, but `clip-studio/deploy/README.md` §4 already documents that `--extractor-args "youtube:player_client=android,web_safari"` was tried on this exact VPS IP during initial setup and did not bypass the same bot-check — it is not a viable independent mitigation on this infrastructure, so it is explicitly out of scope rather than bundled in as originally considered.

## Risks / Trade-offs

- **[Risk] The persistent profile's session eventually dies for real (Google-side full invalidation), and nobody notices until the next real ingestion attempt fails.** → Mitigation: the explicit `sessao_expirada_precisa_login_manual` failure result is designed to be loud (not swallowed), and the existing ingestion error-callback path already surfaces failures to the Uploader/Admin UI — this change doesn't add new silent-failure surface, it reduces the *frequency* of needing to look at it.
- **[Risk] Running a real Chromium instance, even headless, is a meaningfully heavier footprint than anything else currently on this VPS's Docker stack.** → Mitigation: it only runs briefly (once a day, plus on-demand during a retry), not continuously; if VPS resource pressure becomes a problem this is straightforward to move to an external always-off-VPS runner that just pushes the cookie file via `scp` on the same schedule — the ingestion side's contract (read a file at a fixed path) doesn't change either way.
- **[Trade-off] A real one-time manual setup step is required (logging into the profile) before this provides any benefit**, and is required again, rarely, if the session ever fully dies. → Accepted deliberately: this is safer than the alternative (automated login) per the Decisions section above, and is a large reduction in frequency compared to the status quo, not a full elimination.

## Migration Plan

1. Build and deploy the `cookie-refresher` service (new Compose service, new volumes) alongside the existing stack — no changes to already-running services required for this step.
2. One-time manual step: authenticate the persistent Chromium profile (via temporary SSH tunnel/VNC, or by transferring an already-authenticated local profile) and confirm a manual `POST /refresh` call succeeds and produces a valid, non-empty cookie file.
3. Update the `Baixar Video YouTube` node in workflow `mfqp4D5HKs0MNhv1` to add the refresh-and-retry logic on top of its existing master/scratch cookie handling (unchanged otherwise), then republish the workflow — this is the only change to an already-live, in-production workflow, and should happen only after step 2 confirms the refresher actually works end-to-end.
4. Validate with a real YouTube submission through the Clip Studio UI (this is also what unblocks the already-pending tasks 5.7/5.8 from `add-clip-studio-app`).

Rollback: the `Baixar Video YouTube` node change is a single node update in n8n — revertible via the workflow's own version history (already used elsewhere in this project, e.g. `restore_workflow_version`) without touching the `cookie-refresher` service at all. The service itself can be stopped independently at any time; `yt-dlp` simply falls back to whatever cookie file is already on disk (stale, but the pre-existing behavior).

## Open Questions

- Exact daily refresh time (low-traffic window vs. simplest fixed hour) — doesn't affect the design or specs, can be set at deploy time.
