## Context

See proposal.md - Why. This builds directly on `add-podcast-active-speaker-crop` (already in production): same sidecar, same VIDEO_ROOT-mounted volume, same fallback-to-fixed-center-crop philosophy. Validated against real output (execution 1663, clip `podcast_06_o-manicomio-do-iva`): the source recording is multicam-edited even within a single highlight clip, and today's one-offset-per-clip design can't follow a mid-clip camera cut.

## Goals / Non-Goals

**Goals:**
- Detect a camera-angle cut within a clip's time range and give each resulting segment its own crop position.
- Keep the existing per-clip behavior (and its fallback) as the degenerate case when no cut is found - zero regression for the 7 of 8 clips that already work well today.

**Non-Goals:**
- True continuous face-tracking/panning within a single unbroken camera-angle segment - still one static offset per segment, not per-frame. The problem observed is cuts BETWEEN camera angles, not movement within one.
- Re-detecting cuts already implicit in the source's own editing metadata - there's no such metadata available (a plain landscape recording), so this is done by pixel/histogram comparison, same as the face detector's own sampling approach.

## Decisions

**1. Scene-cut detection: color-histogram distance between consecutive samples at a finer sampling rate than today's ~6-per-clip.**
Sample every ~2s across the clip's time range (vs. today's handful of evenly-spaced samples spanning the whole range), compute each frame's color histogram, and flag a cut where consecutive samples' histogram distance (correlation or chi-square) exceeds a threshold - a well-established, cheap, CPU-only technique that doesn't need a dedicated scene-detection library. A real camera cut (different framing/background/people) produces a large histogram jump; normal movement within one continuous shot does not.
*Alternative considered*: ffmpeg's own `scdet` filter. Rejected only because the sidecar already decodes frames via OpenCV for face detection - reusing those same decoded frames for histogram comparison avoids a second decode pass through ffmpeg, and keeps the cut-detection and face-detection logic in one place with one shared understanding of "segment."

**2. Once cut points are found, treat each resulting time range as its own sub-clip for face detection - reusing the EXISTING `find_crop_position` logic per segment, not new logic.**
The existing per-clip algorithm (sample frames, detect faces, score by mouth motion, pick a winner) is exactly what should run again, scoped to each segment's own (usually much shorter) time range. `find_crop_segments()` becomes a thin wrapper: detect cuts, then call the existing per-segment logic once per resulting range.

**3. FFmpeg side: cut one sub-clip per segment (each with its own static crop X), then concat.**
Matches this project's existing bash/Execute-Command style (no exotic filter graphs). For N segments: N `ffmpeg -ss <segStart> -to <segEnd> -i source -vf "scale=-2:1920,crop=1080:1920:${segX}:(ih-1920)/2" ...` calls producing N temp files, then one `ffmpeg -f concat -i list.txt -c copy` to join them into the final clip. Segment boundaries come from the SAME cut-point timestamps the sidecar detected, so there's no re-detection of silence/pause boundaries needed at the segment seams - only the outer clip's `ASTART`/`AEND` (from the existing silence-snap) still apply at the very start/end of the whole clip.
*Alternative considered*: ffmpeg's `sendcmd` filter to change the crop filter's X parameter at specific timestamps within a single ffmpeg invocation. Rejected for this project: `sendcmd` script syntax is one more thing to generate and validate correctly inside an already-large bash one-liner, whereas "cut N pieces, concat" is a pattern this project's bash commands already use elsewhere in spirit (sequential ffmpeg calls) and is easy to `sh -n` / eyeball-validate segment by segment.

**4. Segment count is capped (e.g. max 4 per clip) as a sanity bound.**
A clip is at most 180s; a false-positive cut detector cycling through many spurious "cuts" (e.g. from a flickering light or fast hand gesture) shouldn't fragment a clip into dozens of sub-second segments and dozens of ffmpeg sub-cuts. If more cuts than the cap are detected, keep only the N-1 strongest histogram jumps.

## Risks / Trade-offs

- [Histogram-based cut detection can false-positive on fast pans, lighting changes, or a hand briefly blocking the camera] → Mitigated by the segment cap (decision 4) and by the fact that a false-positive segment split still runs the SAME per-segment face-detection logic - worst case is an unnecessary segment boundary with the same (correct) face still centered on both sides, not a wrong crop.
- [More ffmpeg invocations per clip (N cuts + 1 concat instead of 1 cut) increases processing time and disk I/O for temp files] → Bounded by the segment cap; N is small (≤4) even for a worst-case clip.
- [Concat demuxer requires all segments to share the same codec/resolution/framerate] → All segments come from the same source file cut with the same encode settings (`libx264`, same `-preset`/`-crf`, same `scale=-2:1920,crop=1080:1920`), so this is guaranteed by construction, not something that needs extra validation.

## Migration Plan

Purely additive on top of the already-deployed sidecar and workflow node - no new container, no new network wiring. Rollout: (1) update `detector.py`/`server.py` with segment support behind the same `/crop-position` contract (extend the response shape rather than adding a new endpoint, so a single call still works even if the caller doesn't change), rebuild and redeploy the sidecar container; (2) update "FFmpeg Cortar 9:16 Podcast" to loop over returned segments instead of using a single `xOffset`; (3) validate against the same execution-1663 clips that exposed the bug (re-run the sidecar's `/crop-position` against `podcast_06_o-manicomio-do-iva`'s source time range and confirm it now returns multiple segments matching the real cut points already found in this session's frame review - ~48s and ~102s). Rollback is reverting the FFmpeg node to the single-segment loop (or to the fixed-center formula, the fallback already in place).
