## Why

The podcast active-speaker crop could be fooled by someone moving near their own face without talking (e.g. wiping it with a tissue) — a real production case had that person "win" the active-speaker vote over the person who was genuinely talking, because both produced a similar raw-pixel-diff signal in the mouth region. Landmark-based mouth measurement (MediaPipe Face Mesh) closes this structurally: when the mouth is occluded, no landmarks are found and the sample is skipped instead of being counted as movement, so non-speaking motion near the face can no longer masquerade as talking.

## What Changes

- Active-speaker detection in `podcast-crop-detector` no longer measures raw pixel change in a fixed mouth-region crop; it now measures Mouth Aspect Ratio (lip opening / mouth width) from real facial landmarks, and treats a face whose landmarks aren't found (e.g. occluded by a hand or object) as "no measurement" for that sample rather than as "not talking" or "talking".
- The active-speaker crop position SHALL NOT be won by a non-speaking person whose face/mouth is occluded or who is moving something near their face, even if that movement is sustained across many consecutive samples.
- New runtime dependency (`mediapipe`) and system libraries added to the sidecar's container image to support this.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `podcast-active-speaker-crop`: the "who is talking" signal used to choose among multiple detected faces is now robust to mouth occlusion — a face with an occluded/undetectable mouth is never selected as the active speaker on the basis of that occlusion, and genuine occlusion no longer outscores genuine talking.

## Impact

- `podcast-crop-detector/src/detector.py`: `_mouth_roi_gray()` (pixel-diff) replaced by `_mouth_aspect_ratio()` (MediaPipe Face Mesh landmarks); `TALK_DIFF_THRESHOLD` replaced by `MAR_DELTA_THRESHOLD`.
- `podcast-crop-detector/requirements.txt`: adds `mediapipe==0.10.14`.
- `podcast-crop-detector/Dockerfile`: adds `libgl1`, `libglib2.0-0` (required for mediapipe's wheel to import successfully).
- No change to the sidecar's HTTP contract (`/crop-position`), the n8n workflow, or any other pipeline (Shorts, Palavra Completa) — scoped entirely to the Podcast pipeline's face-detection sidecar.
