## 1. Clip Studio UI

- [x] 1.1 Add "Remover silêncios (Jump Cut)" toggle to `CutModal` in `clip-studio/src/app/(dashboard)/videos/VideoLibrary.tsx`, default off, matching the mockup's label and helper text ("Corta automaticamente os trechos sem fala no vídeo inteiro").
- [x] 1.2 Toggling it calls `saveDraft(clip.itemId)` (same as the slider handlers), so the card shows `Rascunho` while unsaved.
- [x] 1.3 `onSave` (and `handleSaveCut`) pass the toggle's value through as `removeSilence`.

## 2. Clip Studio backend

- [x] 2.1 `clip-studio/src/app/api/clips/trim/route.ts`: accept `removeSilence: boolean` (default `false`) in the body schema, forward it to `trimClip()`.
- [x] 2.2 `clip-studio/src/lib/n8n-client.ts`: extend `trimClip()`'s signature to accept and forward `removeSilence`.

## 3. n8n workflow (production, requires separate go-ahead before starting)

- [x] 3.1 Confirm with the user before touching production n8n — do not start 3.2+ without that confirmation.
- [x] 3.2 `Normalizar Corte`: read `removeSilence` from the webhook body (default `false` if absent), include it in the item passed downstream.
- [x] 3.3 `Baixar e Cortar Clipe`: after the existing `-ss`/`-to` cut, when `removeSilence` is true, run `silencedetect` (`-30dB`, `d=0.5`) against the trimmed output, parse silence intervals, compute kept segments with `0.15s` padding, and build the `filter_complex` trim+concat pass producing the final output; when false, the trimmed file is the final output unchanged (today's behavior). Reject with a clear error if kept-segment total duration falls below ~1s or zero segments remain. Validated locally before applying: `sh -n` syntax check, the awk segment-extraction logic dry-run against synthetic `silencedetect` output, and the shell loop's `filter_complex` string-building all confirmed correct before pushing via MCP.
- [x] 3.4 `Baixar e Cortar Clipe`: measure the final output's real duration via `ffprobe` and emit it (in both modes) instead of relying on the algebraic `newEndSec - newStartSec`. Emitted as a dedicated `REAL_DURATION=<value>` stdout line for reliable parsing downstream.
- [x] 3.5 `Responder Corte OK`: use the `ffprobe`-measured duration from 3.4 instead of `newEndSec - newStartSec` (parses `REAL_DURATION=` from `Baixar e Cortar Clipe`'s stdout via an n8n expression).
- [x] 3.6 Publish the workflow. Published (`activeVersionId: 46bc8a26-979a-40a3-99a3-32574a662346`).

## 4. Verification

- [x] 4.1 `tsc --noEmit` and `eslint` on changed Clip Studio files.
- [x] 4.2 Deploy Clip Studio changes per `clip-studio/deploy/README.md` (with user permission, per this project's standing rule for touching the VPS).
- [x] 4.3 Manual test against `clipstudio.mcobo.com.br`: trim a real clip with the toggle OFF, confirm identical behavior to before this change (same duration reported, same file). Trim a real clip with a known silent gap with the toggle ON, confirm the gap is removed and the reported duration reflects the real shorter output. Confirmed by user (toggle-off regression check, and toggle-on gap-removal case after the timeout/caching fix).
- [x] 4.4 Manual test of the near-fully-silent edge case: select a range that's almost entirely silence with the toggle ON, confirm the trim is rejected with a clear error rather than saving a broken/near-empty clip. Confirmed by user.
