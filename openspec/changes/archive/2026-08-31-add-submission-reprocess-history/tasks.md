## 1. Data model

- [x] 1.1 Add `queuedAt DateTime @default(now())` to `Submission` in `clip-studio/prisma/schema.prisma`.
- [x] 1.2 Add the new `SubmissionAttempt` model (`id`, `submissionId`/`submission` relation, `status`, `errorReason`, `occurredAt`, `@@index([submissionId, occurredAt])`).
- [x] 1.3 Generate the Prisma migration; backfill `queuedAt = createdAt` for existing rows in the migration so pre-existing queue order is preserved.

## 2. Dispatcher changes

- [x] 2.1 Change `dispatchNextIfIdle`'s `FILA` query in `clip-studio/src/lib/dispatcher.ts` from `orderBy: { createdAt: "asc" }` to `orderBy: { queuedAt: "asc" }`.

## 3. Reprocess endpoint

- [x] 3.1 Add `POST /api/submissions/[id]/reprocess`: `requireCapability("youtubeIngestion")`, load the submission, reject with 404 if missing, reject with 403 unless `user.role === "ADMIN" || submission.submittedById === user.id`, reject with 409 (or similar) if `status !== "ERRO"`.
- [x] 3.2 Inside a transaction: create a `SubmissionAttempt` snapshotting the current `status`/`errorReason`/`occurredAt: submission.updatedAt`, then update the submission to `status: "FILA"`, `queuedAt: new Date()`, `errorReason: null`.
- [x] 3.3 After the transaction, call `dispatchNextIfIdle()` fire-and-forget, same pattern as `POST /api/submissions`.

## 4. Attempt history endpoint

- [x] 4.1 Add `GET /api/submissions/[id]/attempts`: `requireCapability("youtubeIngestion")`, same ownership check as reprocess (read access: creator or Admin), 404 if the submission doesn't exist or isn't visible to the caller.
- [x] 4.2 Return that submission's `SubmissionAttempt` rows, `orderBy: { occurredAt: "desc" }`.

## 5. UI — reprocess button

- [x] 5.1 In `clip-studio/src/app/(dashboard)/enviar/SubmissionHistory.tsx`, render a reprocess icon button on rows where `status === "ERRO"` and the row belongs to the current user or the current user is Admin.
- [x] 5.2 Wire the button to `POST /api/submissions/[id]/reprocess`; on success, refresh the table (reuse the existing `load()` poll function).
- [x] 5.3 Match the mockup's circular-arrow icon styling next to the `Erro` pill (`https://claude.ai/code/artifact/f668b615-5073-4519-8e79-8b389d47c18f`, "Enviar Vídeo" screen).

## 6. UI — attempt history popup

- [x] 6.1 Make the `Erro` status pill a `<button>` that fetches `GET /api/submissions/[id]/attempts` on click.
- [x] 6.2 Add a minimal modal component (no new UI library; follow this app's existing card/table CSS in `clip-studio/src/app/globals.css`) listing each attempt's timestamp and error reason, most recent first.
- [x] 6.3 Handle the empty-history case (submission never reprocessed) with a simple "nenhuma tentativa anterior" message instead of an empty table.

## 7. Verification

- [x] 7.1 Deploy to the VPS per `clip-studio/deploy/README.md` (scp + `docker compose --env-file .env up -d --build`, migration applied as part of that).
- [x] 7.2 Manually verify against `clipstudio.mcobo.com.br`: reprocess an `Erro` submission as its Uploader, confirm it re-queues and downloads; confirm a second Uploader cannot reprocess it; confirm Admin can; open the attempt-history popup and confirm the prior failure appears. Confirmed by user testing (also drove the follow-up fix moving the error reason out of the main table row into the popup).
- [x] 7.3 Confirm a reprocessed submission's download starts after submissions already `Na fila` at the time of reprocess, not ahead of them. Confirmed by user.
