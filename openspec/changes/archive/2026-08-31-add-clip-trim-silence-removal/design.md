## Context

See proposal.md - Why. Today's trim pipeline (`clip-studio/src/app/api/clips/trim/route.ts` → `n8n-client.ts`'s `trimClip()` → n8n webhook `clip-studio/clips/trim` → `Normalizar Corte` → `Baixar e Cortar Clipe` Execute Command → upload back) does a single `ffmpeg -ss $START -to $END` cut and reports `durationSeconds = newEndSec - newStartSec` (algebraically correct today because the cut always produces exactly that span). `Baixar e Cortar Clipe` already runs inside the n8n container, which already has `ffmpeg`/`ffprobe` available (used by this same node today for its ffprobe duration-validation step, and by other Execute Command nodes in this workflow) — no new tooling needed.

## Goals / Non-Goals

**Goals:**
- Match the mockup's toggle exactly (label, helper text, default off).
- When off, zero behavior change from today's trim (same command shape, same response shape).
- When on, remove silence across the whole selected range in one save action, without a second manual step.

**Non-Goals:**
- Dynamic per-video noise-floor calibration (the sibling `n8n-video-silence-cutter` project's pipeline does this after finding a fixed `-30dB` threshold unreliable across recordings — see that project's `CLAUDE.md`, "Correção de timing dos cortes"). Out of scope for v1 here: fixed constants, revisit if real usage shows the same problem.
- Any change to how clips are first produced by the "Blocos" pipeline — this only affects the Clipador's own manual re-cut, after a clip already exists in the library.
- Exposing the noise threshold, minimum-silence-duration, or padding as user-configurable — fixed constants for v1 (see Decisions).

## Decisions

### Two-stage ffmpeg: trim first (unchanged), then remove silence from the trimmed output

**Decision:** `Baixar e Cortar Clipe` keeps its existing `ffmpeg -ss $START -to $END ...` cut producing an intermediate file exactly as today. When `removeSilence` is true, a second stage runs `ffmpeg -af silencedetect=noise=-30dB:d=0.5 -f null -` against that intermediate file, parses `silence_start`/`silence_end` pairs, computes the complementary "keep" segments (with a small padding margin — see below — subtracted/added at each boundary so speech isn't clipped), and builds an `ffmpeg -filter_complex` pass with a paired `trim`/`atrim` (video and audio) for each kept segment, `setpts`/`asetpts` to re-baseline timestamps, and a final `concat=n=N:v=1:a=1` joining them into one continuous stream. This is a real jump cut: both the video frames and the audio for each removed silent segment are dropped — the clip physically shortens, it is not just audio muted under unchanged video. When `removeSilence` is false, the intermediate file from stage one *is* the final output (renamed), identical to today's behavior.

**Why not detect silence on the original file directly, before trimming:** trimming first keeps the silence-detection window scoped exactly to what the user selected (matches "vídeo inteiro" in the mockup's helper text meaning "the whole selected range", not the original untrimmed source) and reuses the existing, already-correct trim step unchanged — silence removal is purely an additional pass on its output.

**Constants for v1 (fixed, not user-configurable):**
- Noise threshold: `-30dB` (same default this project's sibling pipeline started with before finding it needed per-video calibration — acceptable starting point here since re-cut clips are already short, produced speech content, generally cleaner audio than raw service recordings).
- Minimum silence duration to remove: `0.5s` (avoids treating natural speech pauses/breaths shorter than that as cuttable).
- Padding kept on each side of a cut boundary: `0.15s` (avoids clipping the onset/offset of speech immediately adjacent to a removed silence).

**Why fixed constants instead of dynamic calibration up front:** the dynamic-calibration work in the sibling project was itself driven by real production data showing the fixed threshold failing across a wide variety of raw sermon recordings over many hours. Clips here are short, already-cut library content — there's no evidence yet this needs the same treatment, and building it without that evidence would be speculative. Explicitly called out as the first place to look if real usage shows silence removal missing/over-cutting.

### Duration reporting: always `ffprobe`-measure the real output, never compute algebraically

**Decision:** `Baixar e Cortar Clipe` measures the final output file's real duration via `ffprobe` (the same measurement style already used elsewhere in this file for validating the requested range against the source) and passes it forward; `Responder Corte OK` uses that measured value instead of `$('Normalizar Corte').first().json.newEndSec - ...newStartSec`. Applied in both modes (silence removal on or off), not just when it's on.

**Why apply it uniformly instead of only when `removeSilence` is true:** a single code path is simpler and removes the (currently harmless, but no longer guaranteed) assumption that the algebraic value always matches reality. This is the smallest change that keeps the response honest for both modes and matches `n8n-client.ts`'s own documented expectation that this value is "real, not a guess."

### Near-fully-silent selection: reject instead of saving a near-empty clip

**Decision:** after computing the "keep" segments, if their total duration falls below a small floor (e.g. 1s) or there are zero kept segments, the Execute Command step fails with a clear, diagnosable error (matching this workflow's existing error style, e.g. `Normalizar Corte`'s range-validation errors) instead of producing and uploading a near-empty or empty video.

**Why:** matches this project's established pattern elsewhere (the "Blocos" pipeline pairs every non-obvious automated decision with a floor/safety check rather than trusting the happy path) — a user who somehow selects a range that's almost entirely silence gets a clear reason instead of a broken clip landing in their library.

### Toggle counts as an unsaved draft, same as the slider

**Decision:** toggling "Remover silêncios (Jump Cut)" calls the same `saveDraft(clip.itemId)` the slider handlers already call, so the clip card shows `Rascunho` while the toggle is changed but not yet saved — consistent with "Trim (re-cut) clip"'s existing `Rascunho` behavior for slider changes.

## Risks / Trade-offs

- **[Risk] Fixed `-30dB` threshold may under- or over-detect silence for some clips' audio characteristics** (background music, room tone, mic differences). → Mitigation: accepted for v1 per Non-Goals; revisit with dynamic calibration if real usage shows a problem, following the sibling project's already-proven approach.
- **[Risk] Building a multi-segment `filter_complex` string in a shell script is more failure-prone than the existing single `-ss`/`-to` cut.** → Mitigation: the near-fully-silent floor check and the existing output-size/ffprobe validation this node already does both apply after this step too — a broken filter_complex producing a bad or empty file is caught the same way a broken plain cut already is today, not a new failure class.
- **[Risk] A clip that's mostly silence but the Clipador genuinely wants shortened aggressively could hit the "reject" floor unexpectedly.** → Mitigation: the floor is deliberately small (1s) — only near-total-silence selections are rejected, not merely "a lot of silence."

## Migration Plan

1. **Clip Studio changes** (UI toggle, route, `n8n-client.ts`): deploy per the existing flow (`clip-studio/deploy/README.md`), same as prior sessions. No DB migration.
2. **n8n workflow** (separate, explicit go-ahead required — see Decisions/Impact): update the 3 nodes via MCP (`update_workflow`), publish, and verify against a real clip before considering this shipped.
3. No rollback complexity beyond redeploying the previous Clip Studio build / republishing the previous n8n workflow version — purely additive parameter, default-off behavior is unchanged.
