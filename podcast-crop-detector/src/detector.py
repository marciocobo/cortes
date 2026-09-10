"""Active-speaker crop-position detection.

See openspec/changes/add-podcast-active-speaker-crop/design.md - Decisions
for the "why" behind each choice here:
  - OpenCV's small CPU DNN face detector (res10_300x300_ssd), not a heavier
    ML framework - no GPU on this VPS, must stay cheap per clip.
  - A handful of sampled frames across the clip's time range, not every
    frame - keeps per-clip cost bounded.
  - Mouth-region motion across those samples as a proxy for "is talking",
    since the podcast records everyone through one shared table mic (no
    per-person audio channel to correlate against video).
"""

import os

import cv2
import numpy as np

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
_PROTOTXT = os.path.join(_MODEL_DIR, "deploy.prototxt")
_CAFFEMODEL = os.path.join(_MODEL_DIR, "res10_300x300_ssd_iter_140000.caffemodel")

CONFIDENCE_THRESHOLD = 0.5
# Fraction of frame width a detected face may drift between samples and
# still count as "the same person" - the camera is static in this setup,
# so a real re-appearance of the same person should land close by.
TRACK_MATCH_FRACTION = 0.15
DEFAULT_SAMPLE_COUNT = 6
MOUTH_ROI_SIZE = (48, 32)  # (w, h), fixed size so frame-to-frame diff is comparable

# A real bug found in production (see CLAUDE.md, 2026-09-10): with a fixed
# 6 samples regardless of segment length, a long segment (e.g. 108s, no
# camera cut detected within it) samples too sparsely - roughly one frame
# per ~18s - to reliably track who's speaking as turns change. Scale the
# sample count with duration instead, capped for cost.
SECONDS_PER_SAMPLE = 8.0
MAX_SAMPLE_COUNT = 20

# Same investigation found a second, independent bug: two DIFFERENT faces
# detected in the SAME sampled frame could both land within
# TRACK_MATCH_FRACTION of each other and get merged into one track,
# corrupting its "motion" score with a false signal (the pixel diff between
# two different people's mouths, not real speech motion). Track matching
# must be one-face-per-track-per-timestamp (see _match_faces_to_tracks).

# See add-podcast-scene-segmented-crop/design.md - Decisions 1 and 4.
CUT_SAMPLE_STEP = 2.0  # seconds between histogram samples when scanning for cuts
CUT_HIST_DISTANCE_THRESHOLD = 0.5  # correlation distance (1 - correlation); higher = more different
MAX_SEGMENTS = 4

# A camera cut isn't the only reason a single "winner" crop position can go
# stale - a long, unbroken take (no cut detected) can still have several
# people taking turns speaking. Split any post-cut-detection segment
# longer than this into equal time-based sub-windows so each gets its own
# independent speaker analysis, same as a real camera cut would.
MAX_SEGMENT_DURATION = 45.0

_net = None


def _load_net():
    global _net
    if _net is None:
        _net = cv2.dnn.readNetFromCaffe(_PROTOTXT, _CAFFEMODEL)
    return _net


def _detect_faces(frame_bgr):
    """Returns a list of (confidence, x1, y1, x2, y2) in original pixel coords."""
    net = _load_net()
    h, w = frame_bgr.shape[:2]
    blob = cv2.dnn.blobFromImage(cv2.resize(frame_bgr, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
    net.setInput(blob)
    detections = net.forward()

    faces = []
    for i in range(detections.shape[2]):
        confidence = float(detections[0, 0, i, 2])
        if confidence < CONFIDENCE_THRESHOLD:
            continue
        box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
        x1, y1, x2, y2 = box.astype(int)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        faces.append((confidence, x1, y1, x2, y2))
    return faces


def _mouth_roi_gray(frame_bgr, box):
    """Lower-center portion of a face box, resized to a fixed size so
    consecutive samples can be diffed even if the detected box wobbles
    slightly in size."""
    _, x1, y1, x2, y2 = box
    fw, fh = x2 - x1, y2 - y1
    mx1 = x1 + int(fw * 0.2)
    mx2 = x1 + int(fw * 0.8)
    my1 = y1 + int(fh * 0.65)
    my2 = y1 + int(fh * 1.0)
    roi = frame_bgr[my1:my2, mx1:mx2]
    if roi.size == 0:
        return None
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, MOUTH_ROI_SIZE)


def _sample_timestamps(start, end, count):
    if end <= start:
        return [start]
    step = (end - start) / (count + 1)
    return [start + step * (i + 1) for i in range(count)]


def _sample_count_for_duration(duration):
    """More samples for a longer range, so a 108s segment doesn't get the
    same ~6 samples as a 12s one (see MAX_SEGMENT_DURATION comment)."""
    return max(DEFAULT_SAMPLE_COUNT, min(MAX_SAMPLE_COUNT, round(duration / SECONDS_PER_SAMPLE)))


def _match_faces_to_tracks(faces, tracks, match_dist):
    """One-to-one greedy matching between this frame's detected faces and
    existing tracks, closest pairs first - so two different faces present
    in the SAME frame can never both be folded into the same track (the
    bug found in production: it corrupted the winning track's "motion"
    score with the pixel diff between two different people's mouths, not
    real speech motion). Returns a list of (face, track_or_None) pairs -
    None means "start a new track for this face"."""
    candidates = []
    for fi, face in enumerate(faces):
        cx = (face[1] + face[3]) / 2.0
        for ti, track in enumerate(tracks):
            d = abs(track["cx"] - cx)
            if d < match_dist:
                candidates.append((d, fi, ti))
    candidates.sort(key=lambda c: c[0])

    assigned_face = set()
    assigned_track = set()
    result = [None] * len(faces)
    for d, fi, ti in candidates:
        if fi in assigned_face or ti in assigned_track:
            continue
        result[fi] = tracks[ti]
        assigned_face.add(fi)
        assigned_track.add(ti)
    return result


def _read_frame_at(cap, seconds):
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000.0)
    ok, frame = cap.read()
    if not ok:
        return None
    return frame


def find_crop_position(video_path, start_time, end_time, crop_width=1080, crop_height=1920, output_height=None, sample_count=None):
    """Returns a dict: {found: bool, xOffset, faceCount, confidence} (xOffset
    and the rest only present when found is True).

    The caller's ffmpeg command does `scale=-2:<output_height>,crop=...` -
    i.e. it scales the source to `output_height` BEFORE cropping, so the
    crop filter's own coordinate space is the scaled frame, not the
    original. When `output_height` is given, xOffset is returned already in
    that scaled space (mirroring ffmpeg's own `-2` even-width rounding) so
    the caller can drop it straight into the crop filter's X position
    without doing its own scaling math. When omitted, xOffset is in the
    source video's own (unscaled) pixel coordinates. Either way it is
    already clamped so the crop stays inside the frame."""
    if not os.path.isfile(video_path):
        raise FileNotFoundError(video_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise RuntimeError("could not open video: %s" % video_path)

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if sample_count is None:
        sample_count = _sample_count_for_duration(end_time - start_time)
    timestamps = _sample_timestamps(start_time, end_time, sample_count)

    # tracks: each is {"cx": float, "confidences": [...], "prev_mouth": ndarray|None, "motion": float}
    tracks = []
    match_dist = frame_w * TRACK_MATCH_FRACTION

    for t in timestamps:
        frame = _read_frame_at(cap, t)
        if frame is None:
            continue
        faces = _detect_faces(frame)
        matches = _match_faces_to_tracks(faces, tracks, match_dist)

        for (confidence, x1, y1, x2, y2), best_track in zip(faces, matches):
            box = (confidence, x1, y1, x2, y2)
            cx = (x1 + x2) / 2.0
            mouth = _mouth_roi_gray(frame, box)

            if best_track is None:
                tracks.append({
                    "cx": cx,
                    "confidences": [confidence],
                    "prev_mouth": mouth,
                    "motion": 0.0,
                })
                continue

            best_track["cx"] = (best_track["cx"] + cx) / 2.0  # drift slowly with the average
            best_track["confidences"].append(confidence)
            if mouth is not None and best_track["prev_mouth"] is not None:
                diff = cv2.absdiff(mouth, best_track["prev_mouth"])
                best_track["motion"] += float(np.mean(diff))
            best_track["prev_mouth"] = mouth

    cap.release()

    if not tracks:
        return {"found": False}

    winner = max(tracks, key=lambda track: track["motion"])
    center_x = winner["cx"]
    avg_confidence = sum(winner["confidences"]) / len(winner["confidences"])

    scaled_w = frame_w
    if output_height and frame_h:
        scale_factor = output_height / float(frame_h)
        center_x = center_x * scale_factor
        # matches ffmpeg's `scale=-2:H` (width rounded down to even)
        scaled_w = int(frame_w * scale_factor) // 2 * 2

    x_offset = int(round(center_x - crop_width / 2.0))
    x_offset = max(0, min(x_offset, max(0, scaled_w - crop_width)))

    return {
        "found": True,
        "xOffset": x_offset,
        "faceCount": len(tracks),
        "confidence": round(avg_confidence, 3),
    }


def _frame_histogram(frame_bgr):
    """A cheap per-frame fingerprint for cut detection - HSV hue/saturation
    histogram, normalized so lighting-only changes within the SAME shot
    don't dominate the comparison as much as a raw BGR histogram would."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    return hist


def _detect_cuts(cap, start_time, end_time, step=CUT_SAMPLE_STEP):
    """Returns a sorted list of timestamps where consecutive sampled frames'
    histograms differ enough to call it a camera cut - see design.md
    Decision 1 for why histogram distance instead of ffmpeg's scdet."""
    if end_time - start_time < step * 2:
        return []

    t = start_time
    prev_hist = None
    prev_t = None
    candidates = []  # (distance, cut_time)
    while t <= end_time:
        frame = _read_frame_at(cap, t)
        if frame is not None:
            hist = _frame_histogram(frame)
            if prev_hist is not None:
                correlation = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
                distance = 1.0 - correlation
                if distance >= CUT_HIST_DISTANCE_THRESHOLD:
                    # the cut lies between prev_t and t - use the midpoint
                    candidates.append((distance, (prev_t + t) / 2.0))
            prev_hist = hist
            prev_t = t
        t += step

    candidates.sort(key=lambda c: -c[0])
    cuts = sorted(c[1] for c in candidates[:MAX_SEGMENTS - 1])
    return cuts


def _split_long_segment(seg_start, seg_end, max_duration=MAX_SEGMENT_DURATION):
    """A camera cut isn't the only reason a static crop can go stale - a
    long unbroken take can still have people taking turns speaking. Split
    a segment longer than max_duration into equal sub-windows (not just an
    arbitrary chunk size) so each gets its own independent speaker
    analysis, matching the real bug found in production: a 108s
    no-cut segment sampled only ~6 times total (once per ~18s) and its
    winning "speaker" track was decided by a single corrupted sample."""
    duration = seg_end - seg_start
    if duration <= max_duration:
        return [(seg_start, seg_end)]
    n = int(-(-duration // max_duration))  # ceil division
    step = duration / n
    return [(seg_start + i * step, seg_start + (i + 1) * step) for i in range(n)]


def find_crop_segments(video_path, start_time, end_time, crop_width=1080, crop_height=1920, output_height=None, sample_count=None):
    """Like find_crop_position, but splits [start_time, end_time] into
    segments at detected camera cuts (and further at fixed time windows
    within any segment still longer than MAX_SEGMENT_DURATION - see
    _split_long_segment) and returns a crop position for each segment
    independently - see
    openspec/changes/add-podcast-scene-segmented-crop/design.md.

    Returns a list of dicts, each shaped like find_crop_position's return
    value plus `startTime`/`endTime` for that segment. A clip with no
    detected cut and no over-long segment returns a single segment
    covering the whole range - identical in spirit to calling
    find_crop_position once."""
    if not os.path.isfile(video_path):
        raise FileNotFoundError(video_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise RuntimeError("could not open video: %s" % video_path)

    cuts = _detect_cuts(cap, start_time, end_time)
    cap.release()

    boundaries = [start_time] + cuts + [end_time]
    windows = []
    for i in range(len(boundaries) - 1):
        windows.extend(_split_long_segment(boundaries[i], boundaries[i + 1]))

    segments = []
    for seg_start, seg_end in windows:
        result = find_crop_position(
            video_path, seg_start, seg_end,
            crop_width=crop_width, crop_height=crop_height,
            output_height=output_height, sample_count=sample_count,
        )
        result["startTime"] = seg_start
        result["endTime"] = seg_end
        segments.append(result)

    return segments
