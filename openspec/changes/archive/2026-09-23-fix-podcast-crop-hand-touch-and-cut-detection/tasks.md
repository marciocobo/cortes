## 1. Active-speaker tiebreak hardening (2026-09-18)

- [x] 1.1 Reorder the winner tiebreak from `(len(confidences), best_run, talk_hits, motion)` to `(best_run, talk_hits, len(confidences), motion)` in `find_crop_position`
- [x] 1.2 Add the `found: False` branch when a segment has more than one track and none has `talk_hits > 0`, exempting single-track segments from this check
- [x] 1.3 Raise `MAX_SEGMENTS` from 4 to 8
- [x] 1.4 Confirm `tests/test_detector.py` (3 real fixtures) passes against the rebuilt container with no regression

## 2. Real-data validation of the tiebreak fix

- [x] 2.1 Decrypt the OneDrive OAuth2 credential and refresh an access token (explicit user authorization) to re-download the source episode (`podcast6.mov`, 7.52GB)
- [x] 2.2 Recompute all 30 crop segments across the 8 production clips with the fixed detector and diff offsets against the prior run
- [x] 2.3 Visually confirm the two motivating cases at their new offsets against the source video (`armadilha-na-reforma`, `quem-paga-a-conta`)
- [x] 2.4 Re-cut and re-upload all 8 clips to OneDrive, replacing the same items, and confirm size/`lastModifiedDateTime` match the new cut
- [x] 2.5 Remove all secrets and working files (decrypted credential, tokens, 7.5GB source video, scripts/logs) from the VPS

## 3. Re-audit and diagnosis of remaining failures (2026-09-18, same day)

- [x] 3.1 Re-audit the 8 re-uploaded clips with denser sampling (every 6s) against the source video
- [x] 3.2 Instrument `_mouth_aspect_ratio()`/`find_crop_position` directly (MAR, diff, talk_hits per sample) against the two clips still found wrong (`armadilha-na-reforma`, `avalanche-de-desemprego`)
- [x] 3.3 Identify root cause 1: a finger touching the listener's own mouth/chin produces a spurious MAR hit that beats a genuine speaker whose gesturing causes occlusion-driven zero hits
- [x] 3.4 Identify root cause 2: a non-static camera (zoom/pan) within one histogram-undetected segment breaks the "camera is static" tracking assumption
- [x] 3.5 Document both as requiring a structural fix, not a constant tweak, without applying a workaround

## 4. Hand-touching-mouth fix (2026-09-19)

- [x] 4.1 Add `_load_hands()` (MediaPipe Hands, `static_image_mode=True`, `max_num_hands=2`)
- [x] 4.2 Implement `_hand_touching_mouth()`, run on the same face crop as Face Mesh, checking hand landmarks against the mouth's bounding box plus `HAND_MOUTH_MARGIN_FRACTION=0.6` margin
- [x] 4.3 Call `_hand_touching_mouth()` from inside `_mouth_aspect_ratio()` and return `None` (same handling as occlusion) when it's true
- [x] 4.4 Confirm the spurious hit in `armadilha-na-reforma` (t=65.62) now resolves to `mar=None occluded` and the segment correctly falls through to `found: False` / neighbor-fill

## 5. Camera-cut spatial-grid fix (2026-09-19, same day)

- [x] 5.1 Rework `_frame_histogram()` into a spatial grid (`CUT_GRID_COLS=3, CUT_GRID_ROWS=2`) of concatenated per-cell histograms
- [x] 5.2 Implement `_hist_distance()` (manual Pearson correlation over the concatenated vector) and use it in `_detect_cuts()` in place of `cv2.compareHist`
- [x] 5.3 Confirm `avalanche-de-desemprego`'s previously-undetected zoom/reframe now splits into separate segments with genuine, non-occluded talk signal on each side

## 6. End-to-end validation across all 8 production clips

- [x] 6.1 Re-obtain the source episode and re-extract only the needed raw segments (network seek, no full re-download)
- [x] 6.2 Run `find_crop_segments` on all 8 clips with the combined fix; confirm the 4 already-correct clips (`reforma-ou-falencia`, `dinheiro-do-governo`, `contador-nao-basta`, `o-povo-e-o-gigante`) are byte-identical to the prior run
- [x] 6.3 Visually confirm the 2 clips that gained more segments (`contrate-especialistas`, `quem-paga-a-conta`) show coherent framing per new segment, not spurious fragmentation
- [x] 6.4 Re-cut and re-upload all 8 clips to OneDrive, replacing the same items; confirm size/`lastModifiedDateTime` match
- [x] 6.5 Verify the full pipeline (silence-snap + segment cut + concat) sustains the fix in `armadilha-na-reforma`: 9 of 10 sampled frames show the genuine speaker with real mouth movement across nearly the whole clip
- [x] 6.6 Measure per-sample cost with both MediaPipe models running; confirm the sidecar's 120s timeout still has comfortable margin (no timeout increase needed)
- [x] 6.7 Remove all secrets and working files from the VPS at the end of the session

## 7. Follow-up (not blocking, tracked for later)

- [ ] 7.1 Revisit `HAND_MOUTH_MARGIN_FRACTION=0.6` and the grid histogram's cut threshold if a future episode with a different gesturing style shows a new false-positive/negative pattern
- [ ] 7.2 Re-check the sidecar's 120s timeout if a future episode's sample density or clip length pushes materially past what was measured here
