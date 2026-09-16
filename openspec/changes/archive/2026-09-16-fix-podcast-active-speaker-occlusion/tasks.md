## 1. Replace the mouth-movement signal

- [x] 1.1 Add `mediapipe==0.10.14` to `podcast-crop-detector/requirements.txt`
- [x] 1.2 Add `libgl1`/`libglib2.0-0` to `podcast-crop-detector/Dockerfile` (required for mediapipe's wheel to import)
- [x] 1.3 Implement `_mouth_aspect_ratio()` using MediaPipe Face Mesh landmarks (13/14 top/bottom inner lip, 78/308 mouth corners), returning `None` when landmarks aren't found for a face
- [x] 1.4 Replace `_mouth_roi_gray()` call sites with `_mouth_aspect_ratio()`; replace `TALK_DIFF_THRESHOLD=15.0` with `MAR_DELTA_THRESHOLD=0.06`
- [x] 1.5 Ensure a `None` MAR sample is excluded from both movement and stillness counting for that track (does not corrupt `cur_run`/`best_run`/`talk_hits`)

## 2. Validate against real data

- [x] 2.1 Instrument `_mouth_aspect_ratio()` against the existing real fixtures and confirm the quiet-track vs. talking-track MAR/delta regimes are well-separated by `0.06`
- [x] 2.2 Run `tests/test_detector.py` (3 real fixtures, including the 0-faces case) against the rebuilt container and confirm no regressions
- [x] 2.3 Confirm at least one fixture with genuine mouth occlusion (`mar=None` samples) is handled without corrupting that track's `best_run`/`motion`

## 3. Deploy

- [x] 3.1 `docker compose -f deploy/docker-compose.yml up -d --build` on the production VPS
- [x] 3.2 Confirm `import cv2, mediapipe` succeeds inside the rebuilt container (validates the Dockerfile system-library fix)

## 4. Follow-up (not blocking, tracked for later)

- [ ] 4.1 Validate end-to-end against the real segment that originally motivated this fix, once a similar case reappears in production (the original source video is no longer on the VPS)
- [ ] 4.2 Measure per-sample cost of Face Mesh in production and re-check it against the sidecar's timeout (120s) and `SECONDS_PER_SAMPLE=4.0`; adjust either if needed
- [ ] 4.3 Recalibrate `MAR_DELTA_THRESHOLD` if a future real clip shows a talking track being missed or mouth-landmark jitter being counted as talking (current calibration is based on 2 short fixtures)
