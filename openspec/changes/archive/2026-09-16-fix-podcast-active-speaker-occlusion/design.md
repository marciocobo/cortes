## Context

See `proposal.md` — Why. The sidecar `podcast-crop-detector` already does face detection, exclusive per-frame face-to-track matching, and a `best_run`/`talk_hits`/`len(confidences)` tie-break chain to decide which detected face is "talking" in a multi-person segment (all validated in prior sessions, documented in `CLAUDE.md`). What changed is only the *per-sample signal* that feeds into `motion`/`talk_hits`: previously `_mouth_roi_gray()` (a fixed-pixel mouth crop, compared frame-to-frame by raw grayscale diff), now `_mouth_aspect_ratio()` (MediaPipe Face Mesh lip landmarks).

## Goals / Non-Goals

**Goals:**
- Make the active-speaker signal itself blind to non-mouth movement near a face (hand, tissue, head turning), instead of adding another heuristic on top of a signal that can't tell the difference.
- Keep the existing track/tie-break machinery (`talk_hits`, `cur_run`, `best_run`, `motion`, `len(confidences)`) unchanged — only the value fed into it changes.

**Non-Goals:**
- Recalibrating `MAR_DELTA_THRESHOLD` against a larger real-video corpus (only 2 short fixtures used so far — flagged as a residual risk, not blocking this change).
- Measuring/tuning the new per-sample cost against the sidecar's timeout (120s) or sample density (`SECONDS_PER_SAMPLE=4.0`) — flagged as a residual risk.
- Any change to the sidecar's HTTP contract, the n8n workflow, or the Shorts/Palavra Completa pipelines.

## Decisions

**MediaPipe Face Mesh landmarks over a 4th tie-breaking heuristic.** Three heuristics were already added in one prior session to patch the same class of bug (exclusive face-to-track matching, `best_run` consecutive-run scoring, `len(confidences)` as a first tie-breaker) — each fixed the case that motivated it and exposed a new blind spot in the next case. Pixel-diff has no notion of "mouth": a hand or tissue moving over the mouth region produces the same kind of signal as lips opening and closing. Landmarks are qualitatively different — when occluded, MediaPipe simply fails to find the landmarks, giving a natural "unmeasured" state instead of a false movement reading. This closes the bug class structurally instead of adding a 4th heuristic layer.

**Signal: Mouth Aspect Ratio (MAR)**, `(vertical lip opening) / (mouth width)`, using landmarks 13/14 (top/bottom inner lip) and 78/308 (mouth corners). A ratio is used instead of raw landmark distances because it is dimensionless — invariant to camera distance and face size, unlike the old pixel-diff signal which implicitly depended on how large the mouth region was in the frame.

**`MAR_DELTA_THRESHOLD = 0.06`**, replacing `TALK_DIFF_THRESHOLD = 15.0` (a completely different scale — pixel-diff 0–255 vs. a geometric ratio). Calibrated against real fixture data captured via a debug instrumentation script (same technique used in prior sessions): a quiet track measured MAR ≈ 0.007–0.009 with sample-to-sample deltas of 0.0002–0.0024; a genuinely talking track measured MAR 0.04–0.38 with most deltas between 0.02 and 0.34. `0.06` sits comfortably above the quiet-track noise floor and below most real talking deltas. Sample size is small (2 clips, a few seconds each) — see Risks.

**Occluded sample = skipped, not "still" and not "moving".** When `_mouth_aspect_ratio()` returns `None` for a track's sample (landmarks not found), that sample is excluded from both the movement count and the stillness count for that track — it does not extend `cur_run`, does not break it either way it would with a real "no movement" reading, and does not feed `talk_hits`. This is the core structural fix: occlusion becomes invisible to the scoring math instead of being misread as either state.

**`mediapipe==0.10.14` pinned**, added to `requirements.txt`. `libgl1` and `libglib2.0-0` added to the sidecar's Dockerfile (Debian slim base, separate from the n8n Alpine hardened image) — mediapipe's wheel fails at *import* time, not `pip install` time, without these system libraries; this was discovered by attempting a real container build, not by reading mediapipe's docs.

## Risks / Trade-offs

- **[Risk] `MAR_DELTA_THRESHOLD=0.06` calibrated on only 2 short real fixtures, not a broad corpus.** → Mitigation: the two regimes observed (quiet ~0.007–0.009, talking 0.04–0.38) are two orders of magnitude apart, giving comfortable margin even if real-world variance is wider than sampled. Revisit if a production clip shows a genuinely talking track being missed, or landmark jitter on a closed mouth being counted as talking.
- **[Risk] Face Mesh is more expensive per sample than the old pixel diff; production cost not yet measured.** → Mitigation: existing sidecar timeout (120s) and sample density (`SECONDS_PER_SAMPLE=4.0`) were sized for the pixel-diff cost. Not addressed by this change — flagged in tasks.md as a follow-up measurement, not a blocker (the pipeline already falls back safely to the fixed center crop on any sidecar timeout).
- **[Risk] Not yet validated end-to-end against the exact real segment that originally motivated this fix** (source video no longer present on the VPS). → Mitigation: validated instead against the same 3 real fixtures already used by `tests/test_detector.py`, plus a directly-observed occlusion case in one of them (`podcast_03`, 3 consecutive `mar=None` samples handled cleanly). Re-validate opportunistically if the pipeline produces a new clip with a similar occlusion pattern.

## Migration Plan

Already deployed and validated in the session that made the code change (per `CLAUDE.md`, 15/09/2026): `docker compose -f deploy/docker-compose.yml up -d --build` on the production VPS, `import cv2, mediapipe` confirmed working inside the rebuilt container, and `tests/test_detector.py`'s 3 real-fixture cases (including the 0-faces case) passed. No rollback plan beyond redeploying the previous image — no data migration or schema involved, this is a stateless detection service.

## Open Questions

None — the two follow-up measurements above (threshold recalibration against more real video, per-sample cost/timeout re-check) are deferred but don't change the spec, the chosen approach, or the task breakdown; they're tracked as follow-up work in tasks.md.
