## Context

See proposal.md - Why. Current implementation: `Submission` (Prisma model, `clip-studio/prisma/schema.prisma`) has a single `status`/`errorReason` pair that gets overwritten on every transition; `dispatchNextIfIdle` (`clip-studio/src/lib/dispatcher.ts`) enforces "at most one `BAIXANDO` at a time" with a DB check plus `orderBy: { createdAt: "asc" }` over `FILA` rows; `pollProcessingSubmissions` (`clip-studio/src/lib/poller.ts`) moves `PROCESSANDO` → `CONCLUIDO`/`ERRO`. `GET /api/submissions` already scopes rows to the caller (`submittedById` for non-Admin, all rows for Admin) per the existing "Submission history" requirement — see `clip-studio/src/app/api/submissions/route.ts`.

## Goals / Non-Goals

**Goals:**
- Let a failed submission be retried without re-typing title/link, using the same queue mechanics that already exist (no new queue implementation).
- Preserve every past failure reason for a submission, not just the latest.

**Non-Goals:**
- Changing anything about the download step itself, `youtube-cookie-auth`, or the n8n pipeline — reprocess only re-triggers the existing `triggerIngestion` call.
- A general-purpose audit log for all status transitions (successes included) — attempt history here is scoped to failed attempts that got reprocessed, per proposal.md.
- Automatic/scheduled retry — this is a manual, user-triggered action only (consistent with `youtube-cookie-auth`'s existing "No automated login" boundary: a bot-check failure still surfaces as `Erro` for a human to act on, reprocessing doesn't change that).

## Decisions

### Queue ordering: add `queuedAt`, keep `createdAt` for original-submission-time record-keeping

**Decision:** add `queuedAt DateTime @default(now())` to `Submission`. `dispatchNextIfIdle`'s `FILA` query changes from `orderBy: { createdAt: "asc" }` to `orderBy: { queuedAt: "asc" }`. On reprocess, set `queuedAt: new Date()` alongside `status: "FILA"`. `createdAt` is untouched by reprocess, so it keeps meaning "when this submission was first created" for history/display purposes.

**Why:** a reprocessed row keeping its original `createdAt` would jump ahead of submissions that arrived later but haven't downloaded yet, if ordering stayed on `createdAt` — that's surprising queue-jumping behavior a human retrying a failed video almost certainly doesn't intend. `queuedAt` decouples "when created" from "queue position" with a single added column and a one-line ordering change.

**Alternatives considered:**
- Reordering by `updatedAt` — rejected, `updatedAt` changes on every field touch (including things unrelated to queueing, if the model ever grows other mutable fields later), making queue order an accidental side effect rather than an explicit one.
- Always inserting reprocessed submissions at the very front (priority retry) — rejected, not asked for, and would let a failing video repeatedly cut the line ahead of others.

### Attempt history: new `SubmissionAttempt` table, snapshot-on-reprocess

**Decision:** new Prisma model:
```prisma
model SubmissionAttempt {
  id           String     @id @default(cuid())
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id])
  status       SubmissionStatus
  errorReason  String?
  occurredAt   DateTime

  @@index([submissionId, occurredAt])
}
```
The reprocess endpoint, inside one transaction: (1) reads the current `Submission` row, (2) if `status !== "ERRO"` reject (see "Reprocess is only available on failed submissions"), (3) creates one `SubmissionAttempt` row copying `status`, `errorReason`, and `occurredAt: submission.updatedAt` (the moment it last transitioned to `Erro`), (4) updates the `Submission` row to `status: "FILA"`, `queuedAt: now()`, `errorReason: null`, then (5) outside the transaction, calls the existing `dispatchNextIfIdle()` fire-and-forget, same pattern `POST /api/submissions` already uses.

**Why a separate table instead of a JSON column on `Submission`:** ordering ("most recent first"), and the `@@index([submissionId, occurredAt])` for the history popup's query, are both cleaner with a real table than with an unindexed JSON blob; it also matches this schema's existing style (`ClipDuration` is its own small lookup table rather than a JSON field bolted onto something else).

**Why snapshot only on reprocess, not on every `Erro` transition:** the requirement in specs/.../youtube-ingestion/spec.md ("Submission attempt history") only needs *past* attempts preserved — the *current* `Erro` state is still fully visible on the `Submission` row itself (`status`, `errorReason`, `updatedAt`) until it's either reprocessed or the row is otherwise removed. Snapshotting on every `Erro` transition (including ones nobody ever reprocesses) would create rows that duplicate what's already on `Submission` and are never read.

### Reprocess authorization: ownership check inside the route, same shape as existing role check

**Decision:** `POST /api/submissions/[id]/reprocess` calls `requireCapability("youtubeIngestion")` (same as the existing submission routes), then loads the submission and additionally checks `user.role === "ADMIN" || submission.submittedById === user.id`, returning 403 (via the existing `UnauthorizedError` from `rbac.ts`) otherwise.

**Why:** `requireCapability` checks role only, not row ownership — there's no existing per-resource ownership helper in this codebase to reuse, so this follows the same inline-check style `GET /api/submissions` already uses for filtering (`user.role === "ADMIN" ? {} : { submittedById: user.id }`), just as a rejection instead of a filter.

### Popup delivery: new `GET /api/submissions/[id]/attempts` endpoint, client-side modal

**Decision:** a new route returns that submission's `SubmissionAttempt` rows (`orderBy: { occurredAt: "desc" }`), same ownership check as reprocess (read access, not just the creator/Admin write check — matches "Submission history"'s existing visibility rule, which already scopes the whole table this way). `SubmissionHistory.tsx` renders the `Erro` pill as a `<button>` that fetches this endpoint on click and shows the results in a simple modal (no new UI library — this app has no modal component yet; a minimal one following this app's existing card/table CSS patterns in `globals.css` is enough for this scope).

**Why a dedicated endpoint instead of embedding attempts in `GET /api/submissions`:** the list view never needs attempt history for every row up front (only on demand when a user clicks an `Erro` pill), so fetching it eagerly for every submission would be wasted work on every poll (`SubmissionHistory.tsx` already polls every 15s).

## Risks / Trade-offs

- **[Risk] Reprocessing a submission whose original download failure was permanent (e.g. video deleted, private) will just fail again identically, possibly repeatedly.** → Mitigation: none needed at this layer — the attempt history this change adds is exactly what lets a human see "this has failed 4 times with the same reason" and stop retrying; no automatic retry limit is in scope (see Non-Goals).
- **[Risk] `queuedAt` migration on existing rows** — the new column needs a default for rows that already exist. → Mitigation: `@default(now())` combined with a one-time backfill in the migration setting `queuedAt = createdAt` for pre-existing rows, so their relative queue order doesn't change at deploy time.
- **[Risk] Reprocess and the daily/periodic poller could theoretically race** on the same submission (poller marking a stuck `Processando` row `Erro` at the same moment a user reprocesses an older `Erro` row) — not the same row, so not a real conflict; flagging only because both write `Submission.status`. → Mitigation: none needed, they only ever act on rows already in the state they check for (`PROCESSANDO` vs `ERRO`), so they can't race on the same row.

## Migration Plan

1. Prisma migration: add `Submission.queuedAt` (default `now()`, backfilled to `createdAt` for existing rows) and the new `SubmissionAttempt` table.
2. Deploy per the existing Clip Studio flow (`docker compose --env-file .env up -d --build`, migration run as part of that — no change to the deploy mechanics themselves).
3. No rollback complexity beyond the standard Prisma migration `down` — no data is destructively transformed (attempt history is purely additive; `queuedAt` backfill is derived, not replacing existing data).
