# Plain Debian slim image, deliberately outside the Alpine-hardened n8n
# image (which has no apk/python3 and a read-only filesystem) - see
# openspec/changes/add-podcast-active-speaker-crop/design.md - Decisions.
# opencv-python-headless's wheel bundles its own ffmpeg-backed video
# decoding, so no system ffmpeg package is needed here.
FROM python:3.12-slim

WORKDIR /app

# mediapipe's wheel links against libGL/libglib at import time even in
# headless setups (unlike opencv-python-headless, which needs neither) - on
# a bare python:3.12-slim this fails with "libGL.so.1: cannot open shared
# object file" the first time detector.py is imported, not at pip-install
# time, so it's easy to miss until the container actually runs a request.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY models ./models
COPY src ./src

ENV PORT=4610
EXPOSE 4610

CMD ["python", "src/server.py"]
