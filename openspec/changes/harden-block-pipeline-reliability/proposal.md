## Why

A validation pass against `CLAUDE.md` (auditoria de 17/08/2026) and the current
`workflow-blocos.json`/n8n production workflow (`ID4wisnN4Tqpt2zh`) confirms that
none of that audit's findings have been applied yet. The pipeline has been stable
in the sense of zero `error`/`crashed` executions since 31/07/2026, but three real
gaps remain unaddressed: (1) the two OpenAI HTTP calls and several Graph API/FFmpeg
calls have no `retryOnFail`, so a single transient 5xx/timeout throws away hours of
already-completed whisper.cpp work; (2) the OpenAI API key is stored as plain text
in the HTTP node's `headerParameters` instead of an n8n credential, so it leaks into
every workflow export/version-history snapshot; (3) the neighbor-collision clamp
added on 31/07/2026 (to stop clip overlap) compares each clip's adjusted start/end
only against the neighbor's *raw* AI timestamp, not the neighbor's own adjusted
value — confirmed by the clipador agent to let both sides erode toward each other
simultaneously, producing a real gap of 4.74s against an intended 5s floor in one
production case (Pr. Hiro Delgado, clip4→clip5).

## What Changes

- Add `retryOnFail` (with sane `maxTries`/`waitBetweenTries`) to `GPT — Analisar
  Blocos` and `GPT — Seleção Final` (HTTP Request nodes calling the OpenAI API),
  matching the pattern already used on "Baixar Vídeo"/"Upload Short →
  OneDrive"/"Upload Metadados → OneDrive" since 08/07/2026.
- Add `retryOnFail` to the remaining Graph API calls without it (`Resolver Pasta`,
  `Resolver Pasta Saída`, `Listar Arquivos`, `Listar Arquivos (Verificar Fila)`,
  `Mover Vídeo Processado`) and to `FFmpeg Cortar 9:16`.
- Set `onError: continueRegularOutput` on the per-clip nodes inside `Loop Over
  Items` so that one clip failing (ffmpeg error, upload timeout) no longer aborts
  the whole execution and silently drops every subsequent clip.
- Move the OpenAI API key out of the hardcoded `Authorization: Bearer <key>`
  header in both HTTP Request nodes into an n8n credential (`HTTP Header Auth` or
  the native OpenAI credential type), referenced by the nodes instead of embedded
  in `headerParameters`.
- Fix the neighbor-collision clamp in `Montar Clipes`/`FFmpeg Cortar 9:16` so each
  side compares against the neighbor's **adjusted** `real_start`/`real_end`
  instead of the neighbor's raw AI timestamp — closing the gap that currently lets
  both sides erode toward each other below the intended 5s floor.
- **BREAKING** (operational, not user-facing): after this change, the OpenAI
  credential must exist in the target n8n instance before the workflow is
  imported/published — a plain-text key will no longer work as a drop-in
  replacement.

## Capabilities

### New Capabilities
- `pipeline-error-resilience`: retry and per-item error-isolation behavior for the
  Opção 3 (Blocos) n8n workflow's network/AI/ffmpeg calls, so transient failures
  don't discard already-completed work.
- `credential-security`: how the OpenAI API key is stored and referenced by the
  workflow (credential-based, never plain text in node parameters or exports).
- `clip-boundary-safety`: the deterministic collision clamp that prevents the
  per-clip silence-based start/end adjustment from producing overlapping or
  too-close consecutive clips.

### Modified Capabilities
- (none — this is the first OpenSpec change for this project; the collision
  clamp is pre-existing pipeline behavior, but since no prior spec captured it,
  it is documented fresh as a new capability above rather than as a delta)

## Impact

- Files: `n8n-video-silence-cutter.html` (function `buildBlockWorkflow()`),
  `workflow-blocos.json`, and the production n8n workflow `ID4wisnN4Tqpt2zh`
  (applied via MCP `update_workflow` + `publish_workflow`, per the project's
  established three-way sync pattern — see CLAUDE.md "Fluxo de trabalho padrão").
- Nodes touched: `GPT — Analisar Blocos`, `GPT — Seleção Final`, `Resolver
  Pasta`, `Resolver Pasta Saída`, `Listar Arquivos`, `Listar Arquivos (Verificar
  Fila)`, `Mover Vídeo Processado`, `FFmpeg Cortar 9:16`, and the per-item nodes
  inside `Loop Over Items`.
- External dependency: a new n8n credential for the OpenAI API key must be
  created (by the user, who holds the key) before this change can be applied to
  production — this is a manual, one-time n8n UI/MCP step outside this repo's
  files.
- No changes to clip selection logic, AI prompts, or output file naming — this is
  purely reliability/security/boundary-safety hardening on top of the existing
  02/07–17/08/2026 feature set.
