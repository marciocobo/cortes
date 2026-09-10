## Why

The active-speaker crop shipped in `add-podcast-active-speaker-crop` computes ONE fixed horizontal crop offset for a clip's entire duration. Validated against the first real production run (execution `1663`, 8 clips, dense frame sampling every ~9s across all of them): 7 of 8 clips are correctly and consistently framed, because they're a single continuous camera take. But clip `podcast_06_o-manicomio-do-iva` exposed the real gap - the source recording is multicam-edited (wide 3-shot → a speaker's close-up → a listener's reaction close-up → wide shot again) even *within* a single highlight clip, and a single static crop offset computed from a handful of samples across the whole clip cannot follow a camera cut partway through. Confirmed by the user reviewing the actual output: the crop locks onto a silent listener's face for ~45 seconds of a ~158s clip while the person answering the question is off-screen.

## What Changes

- The face-detection sidecar (`podcast-crop-detector`) gains scene-cut detection within a clip's time range and returns one crop offset PER detected camera-angle segment, instead of a single offset for the whole clip.
- The podcast pipeline's clip-cutting step applies each segment's own crop offset instead of one offset for the entire clip, so the output still tracks whoever is actually in whichever camera angle is showing at each moment.
- Scope stays the same as the parent change: only the podcast pipeline (`Zfwhv4pppJf3NhkR`); Shorts and Palavra Completa are untouched.

## Capabilities

### Modified Capabilities
- `podcast-active-speaker-crop`: the crop-position detection requirement changes from "one position per clip" to "one position per detected camera-angle segment within the clip," with a new requirement describing scene-cut detection and its own fallback (a clip where no cut is detected still gets exactly one segment covering the whole clip - today's behavior, not a regression).

## Impact

- `podcast-crop-detector/src/detector.py`: new scene-cut detection (frame-to-frame histogram/pixel-difference comparison over closer-spaced samples than today's ~6-per-clip) and a `find_crop_segments()` that returns a list of `{startTime, endTime, xOffset}` instead of a single `xOffset`.
- `podcast-crop-detector/src/server.py`: `/crop-position` (or a new endpoint) returns the segment list.
- n8n workflow `Zfwhv4pppJf3NhkR`, "FFmpeg Cortar 9:16 Podcast": instead of one `ffmpeg -ss/-to ... -vf crop=...` call, cuts one sub-clip per segment (each with its own crop X) and concatenates them into the final output file.
- Slightly higher per-clip processing time (more sidecar sampling + multiple ffmpeg sub-cuts + a concat pass instead of one cut).
