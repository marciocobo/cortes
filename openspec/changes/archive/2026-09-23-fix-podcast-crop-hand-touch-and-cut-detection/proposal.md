## Why

The active-speaker crop for the Podcast pipeline could still lock onto someone who isn't talking, and camera-cut segmentation could still miss real framing changes — confirmed against real production output (execution #2596, episode "podcast6", 8 clips) after the 2026-09-16 mouth-occlusion fix. Auditing those 8 clips visually found two concrete new failure modes: a "winner" tiebreak that favored whoever was easiest to detect (not whoever was talking), and a fixed cap on detected camera cuts that silently dropped real cuts in heavily-edited multi-camera content. A follow-up re-audit with direct MAR instrumentation then found a third failure mode the first fix didn't reach: a person's own finger touching their own mouth/chin (a thinking or scratching gesture) produces a MAR delta indistinguishable from real speech, and can outscore a genuine speaker whose animated gesturing causes intermittent face occlusion. A fourth, related issue: whole-frame color histograms don't reliably catch a camera zoom/reframe within the same room and lighting, which also silently corrupts face tracking across samples once the framing shifts.

## What Changes

- Reorder the active-speaker tiebreak from `(len(confidences), best_run, talk_hits, motion)` to `(best_run, talk_hits, len(confidences), motion)`, so sustained genuine talk signal outranks raw detection count.
- When a segment has more than one candidate face and none of them shows any measurable talk signal (`talk_hits == 0` for every track), report the segment as `found: False` instead of guessing by detection count, letting the existing neighbor-fill fallback take over.
- Raise `MAX_SEGMENTS` from 4 to 8 so episodes with heavy multi-camera editing aren't capped below their real number of camera-angle changes (`MAX_SEGMENT_DURATION` already bounds the opposite case).
- Add `_hand_touching_mouth()`: run MediaPipe Hands on the same face crop already used for Face Mesh, and treat a sample as unmeasured (`None`, same handling as an occluded mouth) whenever a detected hand landmark falls within a margin of the mouth's bounding box — regardless of whose hand it is.
- Replace the whole-frame color histogram used for camera-cut detection with a spatial grid of histograms (one per grid cell, concatenated) compared by a distance function; this makes cut detection sensitive to a change in framing/composition (e.g. a zoom or reframe within the same room and lighting), not just a change in overall color palette.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `podcast-active-speaker-crop`: the active-speaker tiebreak and camera-cut detection are hardened against three additional failure modes beyond the 2026-09-16 occlusion fix — (1) a passive, easy-to-detect face no longer outranks a genuinely-talking face that has a few missed detections; (2) a segment with multiple candidates and zero talk signal on any of them no longer picks a "winner" by detection count alone; (3) a person's own hand/finger touching their own mouth is treated as an unmeasured sample, the same as any other occlusion, instead of registering as speech; (4) camera-angle segmentation also detects cuts caused by a framing/composition change (zoom, reframe) within an otherwise visually similar shot, not only cuts that change the overall color palette.

## Impact

- `podcast-crop-detector/src/detector.py`: tiebreak key reordered in the active-speaker winner selection; new `found: False` branch for zero-talk-signal multi-track segments; `MAX_SEGMENTS` raised from 4 to 8; new `_hand_touching_mouth()` and `_load_hands()` (MediaPipe Hands), new `HAND_MOUTH_MARGIN_FRACTION` constant; `_frame_histogram()` reworked to a spatial grid (`CUT_GRID_COLS`/`CUT_GRID_ROWS`) with a new `_hist_distance()` comparison function.
- No change to the sidecar's HTTP contract (`/crop-position`), the n8n workflow, or any other pipeline (Shorts, Palavra Completa) — scoped entirely to the Podcast pipeline's face-detection sidecar, same as the 2026-09-16 change.
- Already implemented, tested (`tests/test_detector.py`, no regressions), and validated against real production data: all 8 clips from execution #2596 were reprocessed and re-uploaded, with the two originally-flagged clips (`armadilha-na-reforma`, `avalanche-de-desemprego`) confirmed fixed via direct MAR instrumentation against the source video, and the other 6 clips confirmed byte-identical or visually coherent (no regressions). Deployed to production and committed (`f105f23` and prior commits on `feature/inicial`). This proposal documents that work retroactively for the OpenSpec record.
