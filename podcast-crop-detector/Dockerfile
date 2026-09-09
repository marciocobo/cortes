# Plain Debian slim image, deliberately outside the Alpine-hardened n8n
# image (which has no apk/python3 and a read-only filesystem) - see
# openspec/changes/add-podcast-active-speaker-crop/design.md - Decisions.
# opencv-python-headless's wheel bundles its own ffmpeg-backed video
# decoding, so no system ffmpeg package is needed here.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY models ./models
COPY src ./src

ENV PORT=4610
EXPOSE 4610

CMD ["python", "src/server.py"]
