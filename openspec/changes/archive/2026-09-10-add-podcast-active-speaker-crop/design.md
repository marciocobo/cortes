## Context

See proposal.md - Why. Key constraint driving this design: the VPS runs "Docker Hardened Images (Alpine 3.24)" for the n8n/ffmpeg container - no `apk`, no `python3`, filesystem read-only outside `/home/node/.n8n-files`, and the installed ffmpeg (8.1.2) is not built with `--enable-libopencv` or any DNN/face filter. Face detection cannot run inside that container; it needs a separate service.

The podcast pipeline already writes its downloaded source video and cut clips to `/home/node/.n8n-files` on a Docker volume the n8n container mounts - that volume is the natural hand-off point for a sidecar to read the same files without a separate transfer.

## Goals / Non-Goals

**Goals:**
- Keep a visible, plausible-speaker face in frame for podcast clips with 2-3 people seated side by side.
- Never make the podcast pipeline less reliable than it is today - detection is strictly best-effort.
- Touch only the podcast workflow; zero risk to Shorts/Palavra Completa.

**Non-Goals:**
- True audio-driven active-speaker detection - the podcast recordings use one shared table mic, so there is no per-person audio channel to correlate against video.
- Per-frame dynamic panning/tracking crop within a clip - one crop position per clip is the target; a moving crop is a much larger ffmpeg/encoding change not justified by the problem observed so far (the real episode reviewed has one dominant speaker per highlight clip).
- GPU acceleration - the VPS is CPU-only (6 vCPU); the detector must be cheap enough to run on CPU within a per-clip timeout.
- Applying this to Shorts or Palavra Completa - single, centered speaker doesn't have this problem.

## Decisions

**1. Sidecar stack: Python + OpenCV's built-in DNN face detector, wrapped in a small HTTP service, its own Docker image.**
OpenCV ships a small, permissively-licensed CPU face detector (`res10_300x300_ssd`, a few hundred KB) that needs no GPU and no heavy ML framework - just `opencv-python-headless` and a minimal HTTP layer (FastAPI/Flask). This is a new, ordinary Debian/Alpine-based image outside the hardened n8n image, so none of that image's package-manager/filesystem restrictions apply to it.
*Alternative considered and rejected*: recompile the n8n container's ffmpeg with `--enable-libopencv` and use `find_rect`. Rejected because it couples this feature's maintenance to a custom ffmpeg build inside an image that's deliberately kept minimal/hardened for security, and every future ffmpeg upgrade would need to be rebuilt with the same patch.

**2. Transport: sidecar mounts the same `/home/node/.n8n-files` volume read-only; n8n calls it by file path over HTTP, not by uploading video bytes.**
Avoids re-transferring multi-GB video files over an HTTP request. The sidecar joins the same internal Docker network the n8n container already uses (`n8n_default`), reachable by service name.

**3. "Who is speaking" heuristic: sample a handful of frames across the clip's time range, detect all faces per sampled frame, score each face by mouth-region motion across those samples (simple frame-differencing in the mouth ROI, not a lip-reading model), and crop centered on the highest-scoring face.**
This is a cheap, CPU-only proxy for "is talking" given there's no per-person audio to use. If motion scores are inconclusive (e.g. everyone still, or only one frame has a face), the sidecar falls back internally to the largest/most-central detected face rather than guessing between near-tied candidates.

**4. Granularity: one crop offset per clip, not per-frame.**
Computed once from samples spanning the whole clip. Keeps the ffmpeg command a plain static crop (same shape as today, just a different X offset), avoiding a two-pass or per-frame-coordinate encode. Revisit only if real output shows the dominant speaker changing mid-clip often enough to matter.

**5. Timeout and fallback: the n8n node calls the sidecar with a bounded timeout (order of ~15s, tunable); any non-2xx response, timeout, connection failure, or a `found: false` result makes the node use today's existing fixed-center formula.**
This is the mechanism behind the `podcast-active-speaker-crop` spec's "pipeline never blocks on the detection service" requirement - implemented as a plain HTTP node with `onError: continueRegularOutput`-style handling and a fallback expression for the X offset, matching the pipeline's existing error-tolerance conventions (see `pipeline-error-resilience` capability already in production for Blocos).

**6. Deployment: new `docker-compose.yml` stack alongside n8n's existing one (`/root/podcast-crop-detector` or similar, mirroring the pattern already used for `clip-studio`'s own stack), joined to the shared `n8n_default` network.**

## Risks / Trade-offs

- [Mouth-motion heuristic misfires on non-speech motion (nodding, chewing, laughing)] → Bounded impact: worst case picks the wrong (but still present) face in frame, not no face at all; the existing highlight-selection AI already tends to pick clips with one dominant speaker, limiting how often this matters. Revisit with a real lip-sync model only if manual/`clipador`-style review after rollout shows this happening often.
- [New failure surface: one more container, one more network hop per clip] → Mitigated structurally by the mandatory fallback (spec requirement, not just a design intention) - a sidecar outage degrades quality (back to center crop) but never breaks or slows the pipeline beyond the bounded timeout.
- [Per-clip CPU cost of sampling + detection adds processing time] → Kept small by sampling a handful of frames (not decoding the whole clip) and running detection only once per clip, not per frame of output.
- [Face-detection model quality on this specific studio's lighting/camera] → Only validated conceptually here; needs a real run against the reviewed episode's actual clips before trusting it, called out in tasks.md.

## Migration Plan

Purely additive - no database/schema changes, no changes to any other workflow. Rollout order: (1) deploy the sidecar container, confirm it starts and responds to a health check, before touching the n8n workflow; (2) update "FFmpeg Cortar 9:16 Podcast" (and add the new HTTP Request node calling the sidecar) via MCP, validated locally first the same way other production Code/Execute Command node changes in this project are (`sh -n`, `new Function()` where applicable); (3) re-run the already-processed test episode (or a new short one) and compare crop framing by eye/frame-extraction, the same technique used to diagnose this issue. Rollback is a single node-parameter revert back to the hardcoded center-crop formula - no data migration involved.
