## Purpose

Ensures transient failures in network, AI, and ffmpeg calls made by the Opção 3
(Blocos) n8n workflow do not discard hours of already-completed work (whisper.cpp
transcription, prior AI calls) or silently drop clips that would otherwise have
succeeded.

## Requirements

### Requirement: AI calls retry on transient failure
The `GPT — Analisar Blocos` and `GPT — Seleção Final` HTTP Request nodes SHALL
have `retryOnFail` enabled with a bounded number of attempts and a wait interval
between attempts, so a single transient OpenAI API error (timeout, 5xx) does not
fail the whole execution after whisper.cpp transcription has already completed.

#### Scenario: OpenAI API returns a transient 5xx
- **WHEN** `GPT — Analisar Blocos` or `GPT — Seleção Final` receives a 5xx or
  timeout response from the OpenAI API
- **THEN** the node retries the request up to its configured `maxTries` before
  failing the execution, instead of failing on the first attempt

### Requirement: Graph API and ffmpeg calls retry on transient failure
All Microsoft Graph API calls made by the workflow (`Resolver Pasta`, `Resolver
Pasta Saída`, `Listar Arquivos`, `Listar Arquivos (Verificar Fila)`, `Mover Vídeo
Processado`) and the `FFmpeg Cortar 9:16` Execute Command node SHALL have
`retryOnFail` enabled, consistent with the retry behavior already present on
`Baixar Vídeo`, `Upload Short → OneDrive`, and `Upload Metadados → OneDrive`.

#### Scenario: OneDrive folder listing times out transiently
- **WHEN** `Listar Arquivos` or `Resolver Pasta` receives a transient timeout from
  the Microsoft Graph API
- **THEN** the node retries automatically instead of failing the execution
  immediately

### Requirement: A single clip's failure does not abort remaining clips
Nodes inside `Loop Over Items` that process one clip at a time (ffmpeg cut,
upload) SHALL be configured with `onError: continueRegularOutput`, so that a
failure processing one clip (ffmpeg error, upload timeout) does not abort the
execution and prevent subsequent clips — which would otherwise have succeeded —
from being cut and uploaded.

#### Scenario: One clip's ffmpeg cut fails, others succeed
- **WHEN** the ffmpeg cut for clip 3 of 8 fails (e.g. malformed timestamp,
  transient disk error)
- **THEN** clips 1, 2, and 4–8 are still cut and uploaded normally, and the
  execution's final status reflects that clip 3 specifically failed rather than
  reporting the whole execution as failed with zero clips delivered
