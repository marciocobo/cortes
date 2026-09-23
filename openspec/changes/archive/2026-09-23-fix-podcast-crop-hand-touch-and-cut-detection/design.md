## Context

`podcast-crop-detector/src/detector.py` already implements the 2026-09-16 fix (MediaPipe Face Mesh Mouth Aspect Ratio, `MAR_DELTA_THRESHOLD`, occlusion-as-unmeasured). This change is a second and third hardening pass over the same detector, found via visual and MAR-instrumented audits of real production output (episode "podcast6", execution #2596, 8 clips) rather than synthetic testing. See proposal.md - Why for the four concrete failure modes found. All four are implemented, tested, and already deployed to production; this design documents the approach taken.

## Goals / Non-Goals

**Goals:**
- Make the active-speaker "winner" selection prefer sustained genuine talk signal over raw detectability.
- Avoid guessing a "winner" when no candidate in a multi-face segment shows any talk signal at all.
- Stop a person's own hand/finger near their own mouth from registering as speech.
- Make camera-cut detection sensitive to framing/composition changes, not only color-palette changes.
- Let heavily multi-camera-edited episodes keep more of their real detected cuts.

**Non-Goals:**
- No change to the sidecar's HTTP contract, request/response shape, or the n8n workflow that calls it.
- No attempt to distinguish a genuine hand-near-mouth speech gesture (unlikely in this content) from a non-speech one - any hand landmark near the mouth region is treated as unmeasured, unconditionally.
- No exhaustive parameter sweep for `HAND_MOUTH_MARGIN_FRACTION` or the grid histogram's cut threshold - both are reasoned starting values confirmed against the real cases that motivated them, same calibration posture as `MAR_DELTA_THRESHOLD` in the prior change.
- No change to per-sample audio signal (still no per-person audio channel available on this podcast's shared mic) - detection remains visual-only.

## Decisions

**Tiebreak reorder: `(best_run, talk_hits, len(confidences), motion)` instead of `(len(confidences), best_run, talk_hits, motion)`.** Detection-count-first was backwards for exactly the people this detector cares about: talking causes gesturing and head turns, which *causes* occasional detection misses (motion blur, profile angle), while a passive still face is the easiest thing for the DNN to detect consistently. Moving `best_run`/`talk_hits` first means detection count only breaks ties among tracks already comparable on genuine speech signal, never overrides it. Alternative considered: weighting confidence and talk signal into a single score - rejected as unnecessary complexity when a strict lexicographic tiebreak already matches the intent and is easy to reason about from production logs.

**`found: False` when every candidate has zero talk_hits, but only when there's more than one track.** With a single candidate there's no "who" ambiguity to resolve - a quiet pause with one person on screen should still return that person's position rather than discard an otherwise-fine crop. With multiple candidates and zero talk signal on all of them, picking by detection count or motion is not a signal of who's talking at all - it's a coin flip dressed up as a decision. Reporting `found: False` here lets the existing `_fill_unfound_from_neighbors` neighbor-fill (already used for hard detection failures) reuse the nearest already-validated segment's offset instead.

**`MAX_SEGMENTS` 4 → 8.** The original cap of 4 was sized for a simple 2-3-camera setup. `_detect_cuts` already keeps only the `MAX_SEGMENTS - 1` strongest cuts by histogram distance, so raising the cap doesn't change behavior for simpler episodes (fewer real cuts than the cap just produce fewer segments, unchanged) - it only stops discarding real cuts in heavily-edited content. `MAX_SEGMENT_DURATION` remains the guard against the opposite failure (a genuinely single, long continuous take).

**Hand occlusion via a second MediaPipe model (Hands) on the same crop, not a heuristic on Face Mesh landmarks alone.** Face Mesh keeps returning lip-landmark coordinates when a finger partially overlaps the lip contour - it doesn't fail closed the way it does for a hand fully covering the mouth - so the corrupted MAR delta can't be caught from Face Mesh output alone. Running MediaPipe Hands on the identical face crop (not the whole frame - a wide-shot hand elsewhere in frame is naturally excluded by the crop boundary) and checking hand-landmark proximity to the mouth's own bounding box (with a margin, `HAND_MOUTH_MARGIN_FRACTION = 0.6`) catches the case without needing a hand-vs-face-owner identity check: any hand near this face's mouth invalidates this face's sample, whether it's the toucher's own hand or someone else's. Alternative considered: a stricter geometric/motion heuristic derived from Face Mesh alone (e.g. rejecting improbably large frame-to-frame MAR deltas) - rejected because a real fast mouth-opening during speech can produce a similarly large delta, so there's no threshold that separates the two without a second, independent signal.

**Cut detection: spatial grid of histograms (`CUT_GRID_COLS=3, CUT_GRID_ROWS=2`) + Pearson-correlation distance, instead of one whole-frame HSV histogram.** A zoom/reframe within the same room and lighting barely moves the whole-frame color distribution (same walls, same light), so `cv2.compareHist` on a single histogram misses it - and the resulting stale offset also corrupts face tracking, since the same person's face moves to a very different pixel position across the cut without the tracker being told a cut happened. Splitting the frame into a small grid and concatenating per-cell histograms makes the fingerprint sensitive to *where* color mass sits in the frame, not just how much of each color exists overall - a reframe redistributes color across cells even when the overall palette is nearly identical. `cv2.compareHist` doesn't operate correctly on a concatenated multi-cell vector, so distance is computed with a manual Pearson correlation (`_hist_distance`) over the full concatenated vector instead.

## Risks / Trade-offs

- [Hand-touching-mouth check adds a second per-sample model inference (MediaPipe Hands) alongside Face Mesh] → Measured in production: the 7 clips analyzed in this validation (up to 9 segments each) took well under 60s per clip end-to-end including the extra Hands call, comfortably inside the sidecar's existing 120s timeout. Revisit the timeout only if a future episode's density or clip length pushes past that.
- [`HAND_MOUTH_MARGIN_FRACTION=0.6` and the grid histogram's cut threshold are reasoned values, not swept] → Same posture already accepted for `MAR_DELTA_THRESHOLD` - confirmed against the two real cases that motivated the fix (`armadilha-na-reforma`, `avalanche-de-desemprego`) rather than a large real-video sample. Revisit if a new false-positive/negative pattern appears with a different gesturing style.
- [Raising `MAX_SEGMENTS` increases sensitivity to spurious cuts in already-active content, potentially over-segmenting] → Validated against all 8 production clips: 4 clips with real single-take or simple content stayed byte-identical in segmentation/offsets versus the prior fix, and the 2 clips that gained more segments (`contrate-especialistas`, `quem-paga-a-conta`) were visually confirmed to have coherent framing per new segment, not spurious fragmentation.
- [`found: False` on zero-talk-signal segments increases reliance on `_fill_unfound_from_neighbors`] → That fallback already exists and is exercised by the 2026-09-10 occlusion-adjacent design; this change doesn't introduce a new failure path, only routes more segments through an already-validated one.

## Migration Plan

Already deployed: `docker compose up -d --build` on the production sidecar, `tests/test_detector.py` re-run clean against the rebuilt container, and all 8 clips from execution #2596 reprocessed end-to-end (silence-snap + segment cut + concat) and re-uploaded to OneDrive replacing the same items. No schema, contract, or workflow change, so no coordinated rollback beyond reverting `detector.py` and rebuilding the container if a regression appeared - none did during validation.
