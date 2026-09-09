## Why

The podcast pipeline's 9:16 crop (`crop=1080:1920:(iw-1080)/2:(ih-1920)/2`) is a fixed center crop inherited unchanged from the Shorts ("Blocos") pipeline, where it works because a sermon has one person roughly centered on stage. Podcast episodes are recorded with 2-3 people seated side by side at a table, so the frame's horizontal center usually lands on the microphone or the gap between people, not on whoever is talking. Validated against a real processed episode (execution #1556, workflow `Zfwhv4pppJf3NhkR`, 8 clips): extracted frames show the crop cutting a speaker in half or missing both people's faces entirely in most clips.

## What Changes

- New sidecar service (own Docker container, outside the hardened n8n/ffmpeg image) that detects faces in a podcast source video and returns crop coordinates - the VPS's Alpine Hardened image has no `apk`/`python3` and a read-only filesystem outside `/home/node/.n8n-files`, so face detection cannot run inside the existing ffmpeg build (confirmed: no `find_rect`/`dnn_detect`, not compiled with `--enable-libopencv`).
- The podcast workflow's "FFmpeg Cortar 9:16 Podcast" node calls this sidecar (HTTP) before cutting each clip and uses the returned horizontal crop offset instead of the fixed `(iw-1080)/2` center.
- **BREAKING (internal only)**: none of the Shorts/Palavra Completa pipelines are touched - this change is scoped to the podcast workflow only, since single-speaker sermon video doesn't have this problem.
- Fallback to today's fixed center crop whenever the sidecar is unreachable, times out, or finds no face - the crop must never block or fail a clip's processing.

## Capabilities

### New Capabilities
- `podcast-active-speaker-crop`: face-detection sidecar service and its contract with the podcast n8n workflow (request/response shape, timeout, fallback behavior).

### Modified Capabilities
- `podcast-clipping`: the "Podcast clips are cropped to vertical 9:16, like Shorts" requirement changes from a fixed center crop to one informed by active-speaker detection, with an explicit fallback to the old fixed-center behavior.

## Impact

- New Docker container (Python + a lightweight face-detection library, e.g. OpenCV or a similar CPU-friendly model) added to the VPS's `docker-compose.yml` stack, on the same internal network the n8n container already uses for other services.
- n8n workflow `Zfwhv4pppJf3NhkR` ("YouTube Podcast — Extração de Highlights"): "FFmpeg Cortar 9:16 Podcast" node's command changes to consume a per-clip (or per-segment) crop offset instead of a hardcoded center formula; a new HTTP Request node calls the sidecar beforehand.
- VPS resource usage: one more long-lived container, plus CPU/GPU cost of running face detection over each podcast source video (or over each clip's span) before cutting.
- No changes to Shorts ("Blocos") or Palavra Completa pipelines, their crop stays the fixed center formula it has always used.
