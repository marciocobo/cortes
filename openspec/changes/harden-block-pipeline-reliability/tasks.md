## 1. Pre-work (manual, outside repo)

- [x] 1.1 User creates the native `OpenAI` credential (`openAiApi` type) in the
      target n8n instance with their API key (see design.md - Decision 3,
      revised: native credential preferred over generic `HTTP Header Auth` per
      the HTTP Request node's own builder hint). Done — "OpenAI account",
      id `Nbuq36KrXwL1exNW`

## 2. `n8n-video-silence-cutter.html` — retry & error isolation

- [x] 2.1 In `buildBlockWorkflow()`, add `retryOnFail: true, maxTries: 5,
      waitBetweenTries: 5000` to the `GPT — Analisar Blocos` HTTP Request node
- [x] 2.2 Add the same retry settings to the `GPT — Seleção Final` HTTP Request
      node
- [x] 2.3 Add `retryOnFail: true, maxTries: 5, waitBetweenTries: 5000` to
      `Resolver Pasta`, `Resolver Pasta Saída`, `Listar Arquivos`, `Listar
      Arquivos (Verificar Fila)`, `Mover Vídeo Processado`
- [x] 2.4 Add the same retry settings to `FFmpeg Cortar 9:16`
- [x] 2.5 Set `onError: "continueRegularOutput"` on every per-clip node inside
      `Loop Over Items` (ffmpeg cut, uploads) — not on nodes before the loop

## 3. `n8n-video-silence-cutter.html` — credential migration

- [x] 3.1 Replace the literal `Authorization: Bearer <key>` header value in
      `GPT — Analisar Blocos` with `authentication:"predefinedCredentialType",
      nodeCredentialType:"openAiApi"` (revised from `HTTP Header Auth`, see
      design.md - Decision 3)
- [x] 3.2 Apply the same change to `GPT — Seleção Final`
- [x] 3.3 Remove/neutralize the `openai-key` hardcoded field in the HTML UI if
      it's no longer needed to build the workflow JSON, or update its label to
      clarify it's a fallback/local-testing value only (confirm with user which)

## 4. `n8n-video-silence-cutter.html` — collision clamp fix

- [x] 4.1 In `Montar Clipes`, keep `prevClipEnd`/`nextClipStart` precomputation
      as today (used as fallback), but stop treating `prevClipEnd` as the sole
      source of truth for the backward clamp
- [x] 4.2 In `FFmpeg Cortar 9:16`'s bash command, after computing `AEND`,
      persist it to `/home/node/.n8n-files/.prev_clip_real_end` (overwrite each
      iteration) in addition to the existing `_meta.json` `real_end` patch
- [x] 4.3 At the start of the same bash command (before computing `ASTART`),
      read `.prev_clip_real_end` if present and non-empty; use it as `PREVEND`
      instead of the precomputed `prevClipEnd` when available; fall back to
      `prevClipEnd` (today's behavior) when the file is absent or this is the
      first clip
- [x] 4.4 Leave `NEXTSTART` sourced from the precomputed raw `nextClipStart`
      exactly as today (see design.md - Decision 4 for why the forward
      direction is out of scope)
- [x] 4.5 Add `.prev_clip_real_end` removal to the `rm -f` list in `Limpar
      Vídeo Original`

## 5. Validate HTML changes locally (before touching production)

- [x] 5.1 Run the project's Node harness (`vm.createContext` executing
      `buildBlockWorkflow()`) with production defaults (`min-clip=45,
      ai-engine=openai, min-block-score=40`) and confirm the generated JSON has
      the expected `retryOnFail`/`onError`/credential/clamp changes on every
      touched node
- [x] 5.2 Validate the new/edited bash command in `FFmpeg Cortar 9:16` with
      `sh -n` (Alpine-compatible syntax, no bashisms)
- [x] 5.3 Validate any edited Code node bodies with `new Function()`
- [x] 5.4 Manually simulate the state-file read/write logic with real numbers
      from the documented production case (Pr. Hiro Delgado, clip4→clip5,
      4.74s gap) and confirm the fixed clamp now holds the 5s floor

## 6. Regenerate `workflow-blocos.json`

- [x] 6.1 Regenerate `workflow-blocos.json` from the updated HTML (or patch the
      same nodes surgically, per the project's established pattern) so it
      matches the HTML output byte-for-byte on every touched node

## 7. Apply to production via n8n MCP

- [x] 7.1 Confirm task 1.1 (credential creation) is complete before proceeding
      — done, native `openAiApi` credential "OpenAI account" created by user
- [x] 7.2 `update_workflow` with `setNodeSettings`/`updateNodeParameters` for
      all retry/onError/clamp changes across the touched nodes, atomically (21
      operations, applied successfully; 2 cosmetic validation warnings about
      dead `headerParameters` field when `sendHeaders:false` — harmless)
- [x] 7.3 `update_workflow` with `setNodeCredential` for `GPT — Analisar
      Blocos` and `GPT — Seleção Final` (required as a separate operation —
      see design.md - Decision 3 / CLAUDE.md "Pegadinha de credenciais do MCP").
      Confirmed no plaintext key remains before/after: pre-change fetch showed
      the real key in `headerParameters`, patched immediately after use, and
      never written to a persisted file
- [x] 7.4 `publish_workflow` — `activeVersionId: 667ecdd3-749d-47ee-8dd7-28f5d8b3177f`
- [x] 7.5 `get_workflow_details` on the published workflow and diff-confirm it
      matches `workflow-blocos.json` byte-for-byte on every touched node — all
      16 nodes confirmed matching (retry/maxTries/waitBetweenTries/onError,
      auth/nodeCredentialType, and exact command-string equality on `FFmpeg
      Cortar 9:16`/`Limpar Vídeo Original`). `credentials` binding itself isn't
      visible via `get_workflow_details` (confirmed this is redaction, not
      failure — the pre-existing, known-working OneDrive nodes show the same
      absence of a `credentials` field)

## 8. Validate with a real execution

- [ ] 8.1 Trigger a real execution (manual or wait for the next queued video)
      and confirm it completes without a spurious full-execution failure from
      any single node's transient error — **partially done**: execution #246
      (video "Não saia da presença! || Culto Ao Vivo - Pr. Daniel dos Santos
      16/08/2026", 5661s/~94min) ran the full pipeline through whisper.cpp +
      `GPT — Analisar Blocos` (confirming the new native credential works in
      production — the node would have failed here if auth were broken) but
      ended in the pipeline's own expected error path at "Ranking dos Blocos":
      all 9 blocks (spanning the full video) were classified as
      louvor/avisos/dizimo_oferta/encerramento, zero as `pregacao` — not a
      regression from this change (existing fase-exclusion logic working as
      designed on an apparently atypical service with heavy worship/tribute
      content). Never reached `FFmpeg Cortar 9:16`, so the clamp fix is still
      unvalidated against a real execution. The error path left the
      `.processing.lock` orphaned twice (once from a pre-existing incident
      unrelated to this change, once from #246 itself) — cleared both times
      via the documented temp-node technique, isolating it from the main
      pipeline connection this time to avoid re-triggering a costly real run
      while checking/clearing. Queue now has 1 remaining eligible video ("Se
      posicione diante do problema... Miss. Geovania Soares"). Still needed:
      a real execution that reaches `FFmpeg Cortar 9:16` to validate the
      clamp fix end-to-end. **Retry in progress**: execution #250 started
      2026-08-22T23:05:55Z (video "Se posicione diante do problema... Miss.
      Geovania Soares"), not yet complete.
- [ ] 8.2 Inspect the execution's node results to confirm retried nodes (if any
      transient failure occurred) show multiple attempts before success/failure
- [ ] 8.3 Run the `clipador` agent against the resulting clips and confirm no
      pair has a real gap below 5s from the backward (already-processed) side
- [ ] 8.4 Update CLAUDE.md with the outcome (success/partial/new findings),
      following the project's existing documentation pattern for validated
      fixes

## 9. Archive

- [ ] 9.1 Once validated, run the OpenSpec archive workflow for this change
