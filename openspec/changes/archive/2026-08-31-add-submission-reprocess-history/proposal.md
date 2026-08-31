## Why

The submission history table (`clip-studio/youtube-ingestion` - "Submission history") already shows a per-row `Erro` status, but today that's a dead end: recovering from a failed submission means the Uploader re-typing the same title/link into the submit form as a brand-new submission, and nobody can see *why* earlier attempts on the same video failed without asking an Admin to dig through server logs. The mockup at `https://claude.ai/code/artifact/f668b615-5073-4519-8e79-8b389d47c18f` ("Enviar Vídeo" screen) shows the intended fix: a reprocess (circular-arrow) icon button next to any `Erro` pill, and the `Erro` status itself as a clickable link that opens a popup showing that submission's attempt history.

## What Changes

- Add a "Reprocessar" action (icon button) on any submission history row whose status is `Erro`. Clicking it re-queues that same submission (back of the queue) without requiring the Uploader to re-enter the title/link.
- Before re-queuing, snapshot the submission's current failed state (status, error reason, timestamp) into a new attempt-history record, so each failed attempt is preserved instead of being overwritten by the next one.
- Make the `Erro` status pill clickable, opening a popup that lists every past attempt for that submission (timestamp + error reason for each), most recent first.
- Change queue ordering from `createdAt` to a `queuedAt` timestamp that's reset on reprocess, so a reprocessed submission goes to the back of the queue instead of jumping ahead of submissions still waiting in `Na fila` (implementation detail of the existing "Downloads run one at a time, in submission order" requirement — not a behavior change for first-time submissions, whose `queuedAt` equals `createdAt`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `clip-studio/youtube-ingestion`: adds a "Reprocess a failed submission" requirement (who can trigger it, what it does to status/queue position) and a "Submission attempt history" requirement (what gets recorded per attempt, who can view the popup); updates "Downloads run one at a time, in submission order" to define queue order by `queuedAt` instead of `createdAt` so reprocessed items queue at the back.

## Impact

- `clip-studio/prisma/schema.prisma` — new `SubmissionAttempt` model; `Submission` gains a `queuedAt` field.
- `clip-studio/src/lib/dispatcher.ts` — `dispatchNextIfIdle` orders by `queuedAt` instead of `createdAt`; new reprocess entry point that snapshots the current attempt, resets status to `FILA`, and bumps `queuedAt`.
- `clip-studio/src/app/api/submissions/route.ts` and a new reprocess endpoint (e.g. `POST /api/submissions/[id]/reprocess`).
- `clip-studio/src/app/(dashboard)/enviar/SubmissionHistory.tsx` — reprocess icon button, clickable `Erro` pill, and a new attempt-history popup/modal component.
- No change to the n8n pipeline itself or to `youtube-cookie-auth` — reprocessing only re-triggers this capability's existing download step.
