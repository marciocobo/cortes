## Why

Clips in the video library often contain dead air (pauses, breathing gaps) within the selected trim range that a Clipador currently has to accept as-is — the "Cortar vídeo" modal only supports a straight start/end cut. The updated mockup (Claude Design artifact `f668b615-5073-4519-8e79-8b389d47c18f`, "Cortar vídeo" screen) adds a "Remover silêncios (Jump Cut)" toggle, off by default, that automatically cuts out the silent stretches across the whole selected range together with the trim.

## What Changes

- Add a "Remover silêncios (Jump Cut)" toggle to `CutModal` (video library's trim UI), default off, with helper text "Corta automaticamente os trechos sem fala no vídeo inteiro" (matching the mockup).
- When on, saving the trim performs silence detection across the selected `[newStartSec, newEndSec)` range and removes every detected silent segment (with a small padding margin to avoid clipping speech onsets/offsets), producing a shorter output than a plain trim would.
- When off (the default), behavior is byte-for-byte unchanged from today's plain trim.
- The trim response's `durationSeconds` now always reflects the real output file's measured duration (via `ffprobe`), instead of the algebraic `newEndSec - newStartSec` — required for correctness once the output can be shorter than the selected range, and applied uniformly (not just when silence removal is on) so there is a single code path instead of two.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-studio/video-library`: "Trim (re-cut) clip" gains an optional silence-removal mode; adds new scenarios for the jump-cut behavior and for the near-fully-silent edge case.

## Impact

- `clip-studio/src/app/(dashboard)/videos/VideoLibrary.tsx` — `CutModal` gains the toggle (state + UI, matching the mockup), `handleSaveCut` passes the flag through.
- `clip-studio/src/app/api/clips/trim/route.ts` — accepts and forwards `removeSilence: boolean`.
- `clip-studio/src/lib/n8n-client.ts` — `trimClip()` signature extended.
- **n8n workflow "Clip Studio — Integração N8N" (production, via MCP):** `Normalizar Corte` reads the new flag; `Baixar e Cortar Clipe` (Execute Command) gains the silence-detection + segment-removal logic when the flag is set, and always reports the `ffprobe`-measured output duration; `Responder Corte OK` uses that measured value instead of the algebraic one. Flagged explicitly — this project's established pattern requires a separate go-ahead before touching production n8n (see `clip-studio/deploy/README.md` §3 and the precedent in `add-youtube-cookie-rebootstrap-ui`).
- No change to the "Blocos" pipeline, to submission ingestion, or to any other webhook in this workflow.
