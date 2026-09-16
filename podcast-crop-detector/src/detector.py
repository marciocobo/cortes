"""Active-speaker crop-position detection.

See openspec/changes/add-podcast-active-speaker-crop/design.md - Decisions
for the "why" behind each choice here:
  - OpenCV's small CPU DNN face detector (res10_300x300_ssd), not a heavier
    ML framework - no GPU on this VPS, must stay cheap per clip.
  - A handful of sampled frames across the clip's time range, not every
    frame - keeps per-clip cost bounded.
  - Mouth Aspect Ratio (real lip landmarks, via MediaPipe Face Mesh) across
    those samples as a proxy for "is talking", since the podcast records
    everyone through one shared table mic (no per-person audio channel to
    correlate against video) - see the MAR_DELTA_THRESHOLD comment below
    for why this replaced a raw pixel-diff heuristic on 2026-09-15.
"""

import math
import os

import cv2
import mediapipe as mp
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

# A real bug found in production (see CLAUDE.md, 2026-09-10): with a fixed
# 6 samples regardless of segment length, a long segment (e.g. 108s, no
# camera cut detected within it) samples too sparsely - roughly one frame
# per ~18s - to reliably track who's speaking as turns change. Scale the
# sample count with duration instead, capped for cost.
#
# SECONDS_PER_SAMPLE was originally 8.0, but that quietly canceled out
# against MAX_SEGMENT_DURATION below: every segment gets split to <=45s
# (see _split_long_segment), and round(45/8) == 6 == DEFAULT_SAMPLE_COUNT -
# so the "scale with duration" fix never actually produced more than the
# floor of 6 samples for ANY segment post-split, in either of the two real
# clips that motivated it (confirmed: every segment in both clips sampled
# at exactly 6, days after the fix was supposed to widen that). Lowered to
# 4.0 so a full 45s segment gets ~11 samples instead of 6 - closer to what
# "who talked for at least a couple of continuous seconds" actually needs
# to tell apart from a single reaction (see MAR_DELTA_THRESHOLD and
# best_run below), without paying for 1 DNN inference per video frame.
# Measured against real footage: analyzing a full ~177s clip end to end
# at this density takes ~45-70s of sidecar time (up from ~20s before this
# change) - the caller's HTTP timeout was bumped alongside this (see
# "Detectar Rosto Ativo Podcast" node) to leave headroom.
SECONDS_PER_SAMPLE = 4.0
MAX_SAMPLE_COUNT = 20

# Same investigation found a second, independent bug: two DIFFERENT faces
# detected in the SAME sampled frame could both land within
# TRACK_MATCH_FRACTION of each other and get merged into one track,
# corrupting its "motion" score with a false signal (the pixel diff between
# two different people's mouths, not real speech motion). Track matching
# must be one-face-per-track-per-timestamp (see _match_faces_to_tracks).

# A third bug found in production AFTER the two fixes above (see CLAUDE.md,
# 2026-09-10, clip `boas-escolhas-mudam-o-pais`): summing raw per-step mouth
# diffs rewards MAGNITUDE, not CONSISTENCY, so a track can win on total
# "motion" from just one or two big jumps (a head turn, a reaction) even
# though it barely moved the rest of the time - while the track that's
# genuinely talking shows smaller but steady motion on nearly every sample.
# Ranking tracks by how many samples clear MAR_DELTA_THRESHOLD (consistency),
# falling back to total motion only to break an exact tie, addresses that.
#
# A fourth bug, never fully fixed by the above (see CLAUDE.md, 2026-09-10,
# same clip): raw pixel diff on a fixed mouth-shaped crop has no notion of
# what a mouth actually is - it fires just as strongly for a hand/tissue
# moving across that patch of pixels as for an actual mouth opening and
# closing. A real 30s+ stretch had one person genuinely talking (mouth
# visibly opening/closing, natural micro-pauses between words) score LOWER
# on the old motion metric than another person repetitively wiping their
# face with a tissue - a repetitive physical motion has no natural pauses,
# so it out-scored real speech on any metric built from raw pixel change.
# There is no way to fix this by tuning the pixel-diff approach further -
# it needed a different signal entirely (see 2026-09-15 fix below).
#
# Fix (2026-09-15): replaced the raw pixel-diff mouth-region crop with
# MediaPipe Face Mesh lip landmarks. The per-sample signal is now Mouth
# Aspect Ratio (MAR = vertical lip gap / mouth width, see
# _mouth_aspect_ratio) instead of a generic pixel diff, and the
# consistency/best_run machinery below now tracks changes in MAR instead of
# changes in a pixel patch. This closes the tissue-wiping blind spot
# structurally, not by another tie-break heuristic: a hand/tissue over the
# mouth makes Face Mesh fail to find lip landmarks at all (occlusion), which
# this code treats as "no measurement this sample" (see the None handling
# in the sampling loop) rather than as motion - so a hand or object moving
# near the face can no longer masquerade as talking, regardless of how
# consistent or sustained that motion is.
#
# MAR_DELTA_THRESHOLD is a value change in a lip-width-normalized ratio
# (typically ~0.05-0.4 between fully closed and fully open, per published
# MAR literature for frontal faces), NOT a pixel-diff value - the old 15.0
# threshold (calibrated for 0-255 grayscale pixel diffs) does not carry
# over. 0.06 is a reasoned starting point (a clearly visible lip movement
# between samples, not just jitter from landmark noise on a mostly-closed
# mouth) but has NOT been validated against real podcast footage yet - see
# CLAUDE.md for validation status. Revisit this constant against real clips
# before trusting it the way TALK_DIFF_THRESHOLD was eventually trusted.
MAR_DELTA_THRESHOLD = 0.06

# MediaPipe Face Mesh landmark indices (from its canonical 468-point mesh)
# for the inner lip top/bottom and the mouth corners - see
# https://github.com/google/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py
# for the full topology. These four points are enough for a MAR ratio;
# refine_landmarks (iris/lip refinement) is deliberately left off since it's
# unneeded precision for this and doubles the per-sample cost.
_MOUTH_TOP = 13
_MOUTH_BOTTOM = 14
_MOUTH_LEFT = 78
_MOUTH_RIGHT = 308

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
_face_mesh = None


def _load_net():
    global _net
    if _net is None:
        _net = cv2.dnn.readNetFromCaffe(_PROTOTXT, _CAFFEMODEL)
    return _net


def _load_face_mesh():
    global _face_mesh
    if _face_mesh is None:
        # static_image_mode=True: each sample is treated independently (no
        # frame-to-frame tracking assumption), which matches how this code
        # actually samples - a handful of timestamps seconds apart, not a
        # continuous stream. max_num_faces=1 since this always runs against
        # a single already-cropped face box, never the full frame.
        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=False,
            min_detection_confidence=0.5,
        )
    return _face_mesh


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


def _mouth_aspect_ratio(frame_bgr, box):
    """Real mouth-openness measurement from face landmarks, replacing the
    old mouth-region pixel-diff proxy (see MAR_DELTA_THRESHOLD comment for
    the production bug that motivated this on 2026-09-15). Returns a
    dimensionless ratio (vertical lip gap / mouth width) so it doesn't
    depend on face size or camera distance - or None when Face Mesh can't
    find lip landmarks in this face box at all (occlusion: a hand or
    tissue over the mouth, an extreme angle, motion blur). That None is
    deliberate and load-bearing: the caller treats "no landmarks found" as
    "skip this sample for this track" rather than as zero motion or fake
    motion, which is what makes this robust to hand/object occlusion in a
    way raw pixel diff on a fixed crop never could be."""
    _, x1, y1, x2, y2 = box
    fw, fh = x2 - x1, y2 - y1
    pad_x, pad_y = int(fw * 0.15), int(fh * 0.15)
    cx1, cy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
    cx2, cy2 = x2 + pad_x, y2 + pad_y
    crop = frame_bgr[cy1:cy2, cx1:cx2]
    if crop.size == 0:
        return None

    results = _load_face_mesh().process(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
    if not results.multi_face_landmarks:
        return None

    landmarks = results.multi_face_landmarks[0].landmark
    ch, cw = crop.shape[:2]
    top, bottom = landmarks[_MOUTH_TOP], landmarks[_MOUTH_BOTTOM]
    left, right = landmarks[_MOUTH_LEFT], landmarks[_MOUTH_RIGHT]

    mouth_width = math.hypot((right.x - left.x) * cw, (right.y - left.y) * ch)
    if mouth_width < 1e-6:
        return None
    mouth_gap = math.hypot((bottom.x - top.x) * cw, (bottom.y - top.y) * ch)
    return mouth_gap / mouth_width


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

    # tracks: each is {"cx": float, "confidences": [...], "prev_mar": float|None, "motion": float}
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
            mar = _mouth_aspect_ratio(frame, box)

            if best_track is None:
                tracks.append({
                    "cx": cx,
                    "confidences": [confidence],
                    "prev_mar": mar,
                    "motion": 0.0,
                    "talk_hits": 0,
                    "cur_run": 0,
                    "best_run": 0,
                })
                continue

            best_track["cx"] = (best_track["cx"] + cx) / 2.0  # drift slowly with the average
            best_track["confidences"].append(confidence)
            if mar is not None and best_track["prev_mar"] is not None:
                diff = abs(mar - best_track["prev_mar"])
                best_track["motion"] += diff
                if diff >= MAR_DELTA_THRESHOLD:
                    best_track["talk_hits"] += 1
                    best_track["cur_run"] += 1
                    best_track["best_run"] = max(best_track["best_run"], best_track["cur_run"])
                else:
                    best_track["cur_run"] = 0
            # Only overwrite the anchor on a real measurement - a single
            # occluded sample (hand over mouth) shouldn't discard the last
            # known mouth shape and force the NEXT real sample to also be
            # skipped for lack of a `prev_mar` to compare against.
            if mar is not None:
                best_track["prev_mar"] = mar

    cap.release()

    if not tracks:
        return {"found": False}

    # A track that talks for a real stretch shows up as several CONSECUTIVE
    # hits, not just a high hit count scattered across the segment - two
    # short reactions a few samples apart can rack up the same talk_hits
    # as one sustained run without being sustained speech at all. Rank by
    # the longest consecutive run first (closest proxy to "how many
    # seconds in a row"), talk_hits as the next tiebreak, total motion
    # last - see MAR_DELTA_THRESHOLD and SECONDS_PER_SAMPLE comments for
    # why hits and sampling density matter here.
    #
    # A real case found in production (see CLAUDE.md, 2026-09-10) once
    # defeated this: a track racked up a long, unbroken best_run from
    # sustained pixel motion that WASN'T talking at all (someone wiping
    # their face with a tissue for ~30s) while the genuinely talking person
    # scored lower because natural speech has micro-pauses a repetitive
    # physical motion doesn't. That specific failure mode is now closed
    # structurally by the MAR-based signal (see MAR_DELTA_THRESHOLD comment,
    # 2026-09-15 fix) - a hand/tissue over the mouth makes Face Mesh find no
    # landmarks at all, so it can no longer accumulate any best_run/motion
    # in the first place, regardless of how sustained the physical motion
    # is. len(confidences) (how many samples this track was matched in at
    # all) is still kept as the FIRST tiebreak ahead of best_run, for a
    # separate reason unrelated to the tissue case: a track only detected
    # partway through the segment (face detector missed it earlier - head
    # down, bad angle) is a less reliable read than one present the whole
    # span, even with equally strong MAR signal. Ties (the common case -
    # most speaker pairs are both visible from the first sample) fall
    # through to best_run exactly as before.
    winner = max(tracks, key=lambda track: (len(track["confidences"]), track["best_run"], track["talk_hits"], track["motion"]))
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

    _fill_unfound_from_neighbors(segments)
    return segments


# A real bug found in production (see CLAUDE.md, 2026-09-10, clip
# `boas-escolhas-mudam-o-pais`): a segment can come back with found=False
# just because face detection happened to miss on every one of its own
# samples (motion blur, an awkward angle, a face at the frame's edge) even
# though the SAME footage is a continuous conversation where the segments
# right before and after it both found a face fine. The caller's only
# fallback for found=False was a dead-center crop of the full (often
# multi-person) wide shot - confirmed against a real clip where that
# produced exactly the bug being investigated: the crop centered on
# whoever happened to be dead-center in a 3-person shot, cutting the
# actual, visibly-talking speaker to a sliver at the frame's edge for the
# segment's whole duration. A short segment failing detection is far more
# likely to be "same speaker, bad luck on samples" than "the framing
# genuinely needs to jump to the geometric center" - so reuse the nearest
# neighboring segment's xOffset (by time distance, either direction)
# instead. `found` is left as-is (it still means "this segment's own
# samples found a face") - only xOffset is backfilled, and only when at
# least one segment in the clip actually found something to borrow from.
def _fill_unfound_from_neighbors(segments):
    found_indices = [i for i, s in enumerate(segments) if s.get("found")]
    if not found_indices:
        return
    for i, seg in enumerate(segments):
        if seg.get("found"):
            continue
        nearest = min(found_indices, key=lambda j: abs(j - i))
        seg["xOffset"] = segments[nearest]["xOffset"]
