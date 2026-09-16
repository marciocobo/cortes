## Context

`POST /api/submissions/upload` (`clip-studio/src/app/api/submissions/upload/route.ts`) already streams the incoming request body straight to a local temp file before handing it to n8n:

```ts
await pipeline(
  Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
  createWriteStream(tmpPath)
);
```

This is the one place bytes-received is naturally observable server-side, and it already runs for the full duration of a large upload (the real-world case that motivated this change ran a 7.2GB `.mov` for tens of minutes, and stalled partway through with no visible signal beyond SSH-ing into the VPS and checking the temp file's size by hand).

`GET /api/submissions` (`clip-studio/src/app/api/submissions/route.ts`) already does an unscoped `prisma.submission.findMany(...)` with no `select` — every scalar column on `Submission` is already returned to the client today. Adding columns requires no route change there; `SubmissionHistory.tsx` just needs to read the new fields.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Make an in-progress direct file upload's transfer progress visible as a percentage to anyone viewing the shared history table, sourced from the server (not the uploader's own browser).
- Keep the persistence overhead low enough that tracking progress never meaningfully slows the transfer itself.
- Degrade harmlessly when progress isn't known yet (no total size) or after the row leaves `Baixando`.

**Non-Goals:**
- Progress for YouTube-link submissions (`yt-dlp`'s download inside n8n is not instrumented by this change).
- A progress bar/percentage for the second leg of a direct upload (buffered-file → n8n webhook) — that leg is already fast (~2.2GB in ~40s, per the existing code comment) and is not the leg that was observed stalling.
- Resumable/chunked uploads, retry-from-offset, or any change to what happens when a transfer stalls or fails — this change is about visibility only.

## Decisions

### Track bytes with a counting stream, not a polling loop

Insert a small counting `Transform` stream between `Readable.fromWeb(request.body)` and `createWriteStream(tmpPath)` in the existing `pipeline()` call. Each chunk passing through increments a running byte counter and calls through unchanged (`this.push(chunk)`), so the write to disk is unaffected.

Alternative considered: have a separate `setInterval` on the server poll the temp file's size on disk (`stat`) every N seconds, avoiding any change to the pipeline itself. Rejected: it duplicates work the OS/fs already makes available for free via the stream itself, adds a timer to clean up, and produces one write-availability race (reading a file size mid-`fs.write` is not guaranteed exact) that the stream-based counter doesn't have.

### Throttle persistence by wall-clock time, not by byte count or chunk count

Inside the counting transform, persist progress via `prisma.submission.update(...)` only when at least ~2 seconds have elapsed since the last persisted write (checked with `Date.now()` against a closure variable), not on every chunk.

Alternative considered: persist every N MB. Rejected in favor of time-based throttling because connection speed varies enormously (a healthy connection vs. the stalled 1GB/multi-minute case observed while drafting this proposal) — a byte-count threshold either persists too rarely on a slow/stalled connection (exactly when visibility matters most) or too often on a fast one. Time-based throttling gives a consistent update cadence regardless of speed, which is also what makes a stall visible: if the transfer stalls, the loop simply stops calling `update` (no new chunks arrive), and the UI's last-known percentage naturally stays put — no separate "detect a stall" logic is needed.

The exact interval (proposed: 2s) is a tuning knob, not a behavioral contract — the specs deliberately describe "bounded frequency" and "bounded delay" rather than a fixed number, so this can be adjusted during implementation without a spec change.

### Store `uploadedBytes` / `totalBytes` as nullable `BigInt` columns on `Submission`

A single-file upload observed during this proposal was ~7.2GB — over `Int`'s ~2.1GB ceiling — so the byte counters must be `BigInt` (Postgres `bigint`), not `Int`. Both columns are nullable: `null` means "not a direct-upload submission, or total size not yet known," which the UI treats identically to "no progress to show" (see the `video-upload-ingestion` delta spec's "Percentage not shown before a total size is known" scenario).

Both columns live directly on `Submission` rather than in a separate table: progress is 1:1 with a submission, has no history/audit requirement (unlike `SubmissionAttempt`, which exists specifically to preserve failure history across reprocess events), and is only ever read for the current row.

### Capture `totalBytes` from the `Content-Length` header at request start

Browsers set `Content-Length` automatically for a `fetch` body that's a `File`/`Blob` (a known-length body, not a hand-rolled `ReadableStream`), which is what `SubmitForm.tsx` already sends (`body: file`). The route reads `request.headers.get("content-length")` once, at the top of the handler, alongside the existing `title`/`mode`/`fileName` query-param reads, and persists it as `totalBytes` in the same `prisma.submission.create(...)` call that already sets `status: "BAIXANDO"`.

If the header is absent (defensive case — no code path in this app should produce that today, but a future client or proxy change could), `totalBytes` stays `null` and the UI simply shows no percentage for that row, per the relevant spec scenario — not an error.

### No new API route; ride the existing `GET /api/submissions` polling

`SubmissionHistory.tsx` already polls `GET /api/submissions` every 15 seconds and renders each row. Since that endpoint already returns every scalar column with no `select` clause, no route change is needed — only the Prisma schema change and a small addition to the row-rendering logic in `SubmissionHistory.tsx` (compute a percentage from `uploadedBytes`/`totalBytes` when status is `BAIXANDO` and both are non-null, render it next to the existing `Baixando` pill).

This means the on-screen percentage updates at most every 15 seconds (the existing poll cadence), even though the server persists progress roughly every 2 seconds — coarser than technically possible, but consistent with every other piece of status information already on this table, and avoids introducing a second, faster polling loop or a websocket/SSE channel for one field.

## Risks / Trade-offs

- **[Risk]** A crashed or killed request (browser closed mid-upload, process restart) can leave `uploadedBytes`/`totalBytes` stale on a row that's no longer actually `BAIXANDO`. → **Mitigation**: already covered by existing behavior — the route's existing `catch` block sets `status: "ERRO"` whenever the pipeline throws, and the UI only reads/shows progress while `status === "BAIXANDO"` (per spec), so a stale byte count on an `Erro` or reprocessed row is simply never displayed.
- **[Risk]** Throttled `prisma.submission.update` calls add periodic DB load and a small amount of latency inside the streaming hot path. → **Mitigation**: at a 2s floor, a 40-minute upload produces on the order of a thousand small updates total, far below anything Postgres notices; each update touches one row by primary key. If a given `update` call is slow for any reason, it only delays that byte range's onward `push()` by that long — it does not compound, since the next scheduled update is still time-gated from the last *completed* one.
- **[Trade-off]** Percentage only reflects the browser→Next.js leg, not the (usually much faster) Next.js→n8n handoff that follows. A row can sit near 100% for a little while during that second leg before its status flips to `Processando`. → Accepted: this is called out explicitly as a Non-Goal; the second leg was never the leg observed stalling, and the row still visibly leaves `Baixando` (and its percentage) once that leg completes.

## Migration Plan

Additive Prisma migration only (two new nullable columns, no backfill needed — every existing `Submission` row correctly has `null`/`null`, meaning "no progress data," which is exactly what old YouTube-link and already-completed upload rows should show). No data migration, no n8n workflow change, no coordinated deploy step beyond the normal `prisma migrate deploy` + app redeploy already used for schema changes in this project.
