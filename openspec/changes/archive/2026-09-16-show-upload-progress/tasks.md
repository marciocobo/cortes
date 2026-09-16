## 1. Data model

- [x] 1.1 Add nullable `uploadedBytes BigInt?` and `totalBytes BigInt?` columns to `Submission` in `clip-studio/prisma/schema.prisma`, with a comment explaining they're only meaningful while `status = BAIXANDO` for a direct-upload submission (see design.md - Decisions - "Store ... as nullable BigInt columns").
- [x] 1.2 Generate and apply the Prisma migration (additive only, no backfill).

## 2. Upload route instrumentation

- [x] 2.1 In `clip-studio/src/app/api/submissions/upload/route.ts`, read `Content-Length` from the incoming request headers at the top of the handler (alongside the existing `title`/`mode`/`fileName` reads).
- [x] 2.2 Pass the parsed total size into the `prisma.submission.create(...)` call as `totalBytes` (leave `null` if the header is absent or unparsable).
- [x] 2.3 Insert a counting `Transform` stream between `Readable.fromWeb(request.body)` and `createWriteStream(tmpPath)` in the existing `pipeline()` call, tallying bytes passed through without altering the data.
- [x] 2.4 Inside that transform, throttle persistence to roughly once every 2 seconds of wall-clock time (not per chunk): call `prisma.submission.update({ where: { id: submission.id }, data: { uploadedBytes } })` only when the throttle interval has elapsed since the last persisted write.
- [x] 2.5 Confirm the existing failure path (the `catch` block that sets `status: "ERRO"`) needs no change — leaving a stale `uploadedBytes`/`totalBytes` on an errored row is acceptable per design.md's Risks section.

## 3. Submission history UI

- [x] 3.1 Extend the `Submission` type in `clip-studio/src/app/(dashboard)/enviar/SubmissionHistory.tsx` with `uploadedBytes: string | null` and `totalBytes: string | null` (Prisma `BigInt` serializes as string over JSON — confirm the actual wire shape and adjust the type accordingly).
- [x] 3.2 When rendering a row's status cell, if `status === "BAIXANDO"` and both `uploadedBytes` and `totalBytes` are present and `totalBytes > 0`, compute a percentage and show it next to (or inside) the existing `Baixando` pill.
- [x] 3.3 When `status === "BAIXANDO"` but progress fields are missing/null (YouTube-link submissions, or a direct upload before its first persisted snapshot), keep rendering the plain `Baixando` pill exactly as today — no percentage, no placeholder like "0%".
- [x] 3.4 For any status other than `BAIXANDO`, never render a percentage, regardless of what's stored in `uploadedBytes`/`totalBytes` on that row.

## 4. Verification

- [x] 4.1 Exercise a direct file upload locally (a file large enough, or a throttled connection, to observe multiple progress updates) and confirm the percentage advances in the history table across polling refreshes.
- [x] 4.2 Confirm a YouTube-link submission's `Baixando` row is unaffected (still shows the plain label, no percentage).
- [x] 4.3 Confirm that stalling a direct upload (e.g. killing the connection mid-transfer) leaves the last-known percentage visible rather than showing an error or resetting to 0%, until the row eventually flips to `Erro`.
- [x] 4.4 Confirm a completed upload's row stops showing a percentage once its status moves to `Processando`/`Concluído`/`Erro`.
