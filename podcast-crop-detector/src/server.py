import os

from flask import Flask, jsonify, request

from detector import find_crop_segments

app = Flask(__name__)

# The n8n container's /home/node/.n8n-files is bind-mounted here read-only
# (see deploy/docker-compose.yml) - videoPath in requests is a bare file
# name (e.g. "cmtthbjcu00040img1bah6t2h_PodCast.mov"), resolved against this
# root so the caller never has to know this container's internal layout.
VIDEO_ROOT = os.environ.get("VIDEO_ROOT", "/data")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/crop-position")
def crop_position():
    body = request.get_json(silent=True) or {}

    # Every handled case below returns HTTP 200 with found:false rather than
    # a 4xx/5xx status - the caller (n8n) falls back to the fixed center
    # crop purely by checking the `found` field, without needing to also
    # configure the HTTP node to treat non-2xx responses as non-fatal. A
    # non-2xx / no-response case (sidecar down, DNS failure, timeout) is
    # still a real HTTP-level error for the caller to catch separately.
    video_name = body.get("videoPath")
    start_time = body.get("startTime")
    end_time = body.get("endTime")
    if not video_name or start_time is None or end_time is None:
        return jsonify({"found": False, "segments": [], "error": "videoPath, startTime and endTime are required"})

    video_path = os.path.join(VIDEO_ROOT, os.path.basename(video_name))

    crop_width = int(body.get("cropWidth", 1080))
    crop_height = int(body.get("cropHeight", 1920))
    output_height = body.get("outputHeight")

    try:
        segments = find_crop_segments(
            video_path,
            float(start_time),
            float(end_time),
            crop_width=crop_width,
            crop_height=crop_height,
            output_height=int(output_height) if output_height is not None else None,
        )
    except FileNotFoundError:
        return jsonify({"found": False, "segments": [], "error": "video not found: %s" % video_name})
    except Exception as exc:  # noqa: BLE001 - caller falls back to center crop on found:false
        return jsonify({"found": False, "segments": [], "error": str(exc)})

    # Response shape extended (add-podcast-scene-segmented-crop) from a
    # single {found,xOffset,...} to a segment list - `found` at the top
    # level is true if ANY segment found a usable face, so a caller that
    # only reads the top-level fields still gets sane single-segment
    # behavior (the most confident segment's own xOffset) without having to
    # understand segments at all.
    any_found = any(s.get("found") for s in segments)
    best = max((s for s in segments if s.get("found")), key=lambda s: s.get("confidence", 0), default=None)
    response = {"found": any_found, "segments": segments}
    if best is not None:
        response["xOffset"] = best["xOffset"]
        response["faceCount"] = best["faceCount"]
        response["confidence"] = best["confidence"]
    return jsonify(response)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4610"))
    app.run(host="0.0.0.0", port=port)
