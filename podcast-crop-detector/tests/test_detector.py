"""Smoke test for detector.find_crop_position, run inside the sidecar's own
Docker image (has opencv + the bundled model) - not part of the image
itself, just exercised manually / in CI against the fixtures in
tests/fixtures/.

NOTE on the fixtures: these are real clips already produced by the podcast
pipeline's OLD fixed-center crop (already 1080x1920, vertical) - not the
original landscape source video (7.5GB, not practical to keep as a repo
fixture). They're still useful to confirm the detector runs cleanly against
real footage and behaves sanely across a 0/1/2+-face spread - genuine
end-to-end validation against the landscape original happens in tasks 4.1-4.3
against a real production run.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from detector import find_crop_position  # noqa: E402

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

CASES = [
    # (file, expectation label - informational, not a strict assertion)
    ("podcast_01_reforma-ameaca-negocios.mp4", "1-2 faces expected (two people, one talking)"),
    ("podcast_03_contrate-especialistas.mp4", "2 faces expected (two people visible)"),
    ("podcast_07_a-voz-de-quem-vem-de-baixo.mp4", "0-1 faces expected (torsos, heads cropped out of frame)"),
]


def main():
    failures = []
    for filename, expectation in CASES:
        path = os.path.join(FIXTURES_DIR, filename)
        if not os.path.isfile(path):
            print("SKIP %s (fixture not present)" % filename)
            continue

        try:
            result = find_crop_position(path, 5.0, 15.0, crop_width=1080, crop_height=1920)
        except Exception as exc:  # noqa: BLE001
            failures.append("%s raised %r" % (filename, exc))
            print("FAIL %s: raised %r" % (filename, exc))
            continue

        print("%s (%s) -> %s" % (filename, expectation, result))

        if result.get("found"):
            if not (0 <= result["xOffset"] <= 1080):
                failures.append("%s: xOffset %r out of expected bounds for a 1080-wide fixture" % (filename, result["xOffset"]))
            if result.get("faceCount", 0) < 1:
                failures.append("%s: found=True but faceCount < 1" % filename)
        else:
            if "found" not in result:
                failures.append("%s: response missing 'found' key" % filename)

    if failures:
        print("\n%d failure(s):" % len(failures))
        for f in failures:
            print(" - %s" % f)
        sys.exit(1)

    print("\nAll fixture cases ran cleanly with well-formed responses.")


if __name__ == "__main__":
    main()
