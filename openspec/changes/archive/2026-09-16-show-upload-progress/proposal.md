## Why

Direct file uploads to Clip Studio (`Enviar arquivo`, any content type) can take a long time for large source videos — a real upload observed during this proposal ran ~7.2GB and took tens of minutes. While a submission sits in `BAIXANDO`, the Histórico de envios table gives no indication of how far along the transfer is, or whether it has stalled. Today the only way to check progress is to SSH into the VPS and inspect the size of the server-side temp file by hand. Anyone viewing the shared history table (not just the uploader) has no visibility at all.

## What Changes

- The server tracks bytes received for an in-progress direct file upload (the leg where `/api/submissions/upload` streams the request body to a local temp file before handing it to n8n) and persists periodic progress snapshots on the `Submission` row.
- `GET /api/submissions` includes this progress (bytes received / total bytes) for submissions currently uploading, so the existing polling history table can render a percentage.
- `SubmissionHistory.tsx` shows a percentage (and a simple progress indicator) next to the `Baixando` status pill for submissions that came from a direct file upload, replacing the plain "Baixando" text while a total size is known.
- Submissions ingested via a YouTube link keep the current `Baixando` label unchanged — no equivalent byte-level progress exists for that path (n8n's own `yt-dlp` download isn't instrumented, and is out of scope here).
- Progress fields are cleared/left stale-but-harmless once the submission moves past `BAIXANDO` (`Processando`, `Concluído`, or `Erro`) — the UI only reads them while status is `BAIXANDO`.

## Capabilities

### New Capabilities
(none — this extends the existing upload-ingestion and submission-history behavior rather than introducing a new capability)

### Modified Capabilities
- `clip-studio/video-upload-ingestion`: the upload route must track and persist transfer progress while streaming the request body to disk, and the shared history table must surface that progress for in-flight direct-upload submissions.

## Impact

- `clip-studio/prisma/schema.prisma`: new nullable columns on `Submission` (e.g. `uploadedBytes`, `totalBytes`) plus a migration.
- `clip-studio/src/app/api/submissions/upload/route.ts`: instrument the existing `pipeline(Readable.fromWeb(...), createWriteStream(tmpPath))` call to count bytes and periodically persist progress (throttled — not on every chunk).
- `clip-studio/src/app/api/submissions/route.ts` (GET handler) or equivalent: include the new fields in the response shape already consumed by `SubmissionHistory.tsx`.
- `clip-studio/src/app/(dashboard)/enviar/SubmissionHistory.tsx`: render a percentage/progress bar next to the `Baixando` pill when progress data is present.
- No change to the YouTube-link ingestion path, to n8n workflows, or to the OneDrive/whisper.cpp pipeline.
