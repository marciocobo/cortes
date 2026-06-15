# n8n · YouTube Shorts Generator — Contexto do Projeto

## Visão Geral

Workflow n8n para geração automática de YouTube Shorts a partir de vídeos longos armazenados no Google Drive. O vídeo é baixado para a VPS, processado e fatiado em múltiplos clipes de 1m15s–2m30s em formato 9:16 (crop centralizado, sem barras pretas), depois reenviado ao Drive.

---

## Infraestrutura

| Item | Valor |
|---|---|
| Plataforma de automação | n8n 2.25.7 (self-hosted, Docker) |
| Diretório de trabalho na VPS | `/home/node/.n8n-files/` |
| Fonte dos vídeos | Google Drive (pasta monitorada por trigger) |
| Google Drive Folder ID | `1wW1WhX1oyb4jbP0vQded403fQdmDMQQl` |
| Destino dos Shorts | Mesma pasta do Drive (`short_01.mp4`, `short_02.mp4` …) |
| Processamento de vídeo | FFmpeg + ffprobe (instalados via Dockerfile customizado) |
| Transcrição (Opções 1 e 2) | whisper.cpp local (modelo `ggml-base`), sem API |
| Análise semântica (Opção 1 apenas) | Anthropic Claude API (`claude-sonnet-4-6`) |

---

## Dois Workflows

### Opção 1 — Semântico (Claude + Whisper.cpp local + FFmpeg)
Transcreve o vídeo inteiro com whisper.cpp local (sem OpenAI), envia o SRT completo ao motor de IA escolhido (Claude, Ollama local ou nenhum), que identifica até **5 dos melhores momentos** semanticamente (gancho, conclusão, autocontido) para clipes de 75s–150s. Cada clipe é processado em loop sequencial: extrai áudio do trecho, gera legenda `.srt` via whisper.cpp (opcional, com toggle no painel), corta em 9:16 com crop centralizado, queima a legenda e faz upload do Short + arquivo `_meta.json` (título, hook, motivo). **Sem OpenAI; com Ollama ou "nenhum" o custo é $0.**

### Opção 2 — Simples (FFmpeg only, zero custo de API)
Detecta silêncios por volume de áudio (`silencedetect`), agrupa blocos de fala em clipes de 75s–150s, converte para 9:16 com crop centralizado e faz upload. **Sem OpenAI, sem Anthropic, custo $0.**

---

## Fluxo Completo — Opção 2 (Simples, versão atual v16)

```
Google Drive Trigger (novo arquivo na pasta)
  ↓
Baixar Vídeo (Google Drive: Download)
  ↓
Salvar na VPS (Write Binary File → /home/node/.n8n-files/video.mp4)
  ↓
Paths: Vídeo (Code Node)
  → retorna: { videoName, videoPath }
  ↓
FFprobe + Silêncios (Execute Command)
  → mede duração total com ffprobe
  → detecta silêncios com ffmpeg silencedetect
  → stdout: "DURATION:847.3\nsilence_start: 12.4\nsilence_end: 14.1\n..."
  ↓
Montar Clipes (Code Node)
  → parseia stdout, agrupa blocos de fala em janelas de 75s–150s
  → cada item do output tem: { clipStart, clipEnd, idx, videoPath, videoName, outPath, audioPath, srtBase, srtPath }
  ↓
Extrair Áudio do Clipe (Execute Command)  ← recebe $json de Montar Clipes
  → ffmpeg corta só o trecho do clipe e extrai WAV 16kHz mono → audioPath
  ↓
Preparar Whisper (Code Node)
  → repassa os campos de Montar Clipes (pois Execute Command só passa stdout)
  ↓
Whisper.cpp Transcrever (Execute Command)
  → whisper-cli (modelo ggml-base, local, sem API) transcreve audioPath
  → gera legenda em srtPath (.srt)
  ↓
Preparar Corte Final (Code Node)
  → repassa os campos de Montar Clipes
  ↓
FFmpeg Cortar 9:16 + Legenda (Execute Command)
  → corta o clipe, converte para 1080×1920 com scale+crop centralizado
  → queima a legenda do srtPath (filtro subtitles + force_style)
  → salva em /home/node/.n8n-files/short_01.mp4
  ↓
Preparar Leitura (Code Node)
  → relê outPath, idx do Montar Clipes (pois Execute Command só passa stdout)
  ↓
Ler Short do Disco (Read Binary File)
  → lê o .mp4 do disco e coloca no campo 'data' (binário)
  ↓
Upload → Drive (Google Drive)
  → envia short_01.mp4 para a pasta 1wW1WhX1oyb4jbP0vQded403fQdmDMQQl
```

**Total: 14 nodes | APIs: 0 | Custo: $0** (transcrição via whisper.cpp local, modelo `base`)

---

## Fluxo Completo — Opção 1 (Semântico, versão atual v18-semantic-local)

```
Google Drive Trigger (novo arquivo na pasta)
  ↓
Baixar Vídeo → Salvar na VPS
  ↓
Preparar Caminhos (Code) → { videoName, videoPath, audioPath }
  ↓
FFprobe + Extrair Áudio (Execute Command)
  → ffprobe mede duração total
  → ffmpeg extrai WAV 16kHz mono do vídeo inteiro
  → stdout: "DURATION:847.3"
  ↓
Preparar Whisper Completo (Code)
  → parseia DURATION do stdout, define srtBase/srtPath do transcript completo
  ↓
Whisper.cpp Transcrever Completo (Execute Command)
  → whisper-cli (modelo ggml-base, local) transcreve o áudio inteiro em .srt
  → faz `cat` do .srt gerado → stdout = transcrição completa com timestamps
  ↓
Preparar Claude (Code)
  → repassa videoPath/videoName/duration + transcript (stdout)
  ↓
Claude — Gerar Clipes (HTTP Request → Anthropic)
  → recebe a transcrição SRT completa + duração total
  → identifica até 5 dos MELHORES momentos (gancho, conclusão, autocontido, 75–150s)
  → retorna JSON: [{ start, end, title, hook, reason }, ...] (máx. 5 itens)
  ↓
Montar Clipes (Code)
  → valida durações (75–150s), limita a 5 clipes
  → cada item: { clipStart, clipEnd, idx, videoPath, videoName, outPath, audioPath,
                  srtBase, srtPath, metaPath, metaContent, titleSlug, hook, reason }
  ↓
Loop Over Items (Split In Batches, batchSize=1) — processa cada clipe sequencialmente
  ↓
Extrair Áudio do Clipe (Execute Command)
  → ffmpeg corta só o trecho do clipe e extrai WAV 16kHz mono → audioPath
  ↓
Preparar Whisper (Code) → repassa campos do clipe
  ↓
Whisper.cpp Transcrever (Execute Command)
  → whisper-cli transcreve o trecho do clipe → gera legenda em srtPath (.srt)
  ↓
Preparar Corte Final (Code) → repassa campos do clipe
  ↓
FFmpeg Cortar 9:16 + Legenda (Execute Command)
  → salva metaContent (_meta.json) no disco
  → corta o clipe, converte para 1080×1920 com scale+crop centralizado
  → queima a legenda do srtPath (filtro subtitles + force_style)
  → salva em /home/node/.n8n-files/short_NN_<slug>.mp4
  ↓
Preparar Leitura (Code) → outPath, metaPath, idx, titleSlug, videoName
  ↓
Ler Short do Disco (Read Binary File) → Upload Short → Drive
  ↓
Preparar Leitura Meta (Code) → repassa metaPath, idx, titleSlug
  ↓
Ler Metadados do Disco (Read Binary File) → Upload Metadados → Drive
  ↓
volta ao Loop Over Items até processar todos os clipes (máx. 4)
```

**Total: 21 nodes | APIs: apenas Anthropic Claude (sem OpenAI) | Transcrição: whisper.cpp local ($0)**

---

## Regra Crítica — Execute Command e Paths

> **O Execute Command só enxerga `$json` do node imediatamente anterior.**
> Se o predecessor for outro Execute Command, `$json` terá apenas `stdout` — os paths são perdidos.

**Padrão obrigatório:**
```
[Code Node → define todos os campos necessários]
  ↓
[Execute Command → usa {{ $json.videoPath }} etc.]
```

Nunca colocar dois Execute Command em sequência sem um Code Node entre eles.

---

## Parâmetros de Corte (Opção 2)

| Parâmetro | Valor | Descrição |
|---|---|---|
| Duração mínima do clipe | 75s (1m15s) | Clipes abaixo disso são descartados |
| Duração máxima do clipe | 150s (2m30s) | Limite máximo |
| Limiar de silêncio | -30 dB | Volume abaixo = silêncio |
| Duração mínima do silêncio | 0.4s | Pausas menores são ignoradas |
| Margem de frames | 0.15s | Buffer antes/depois de cada corte |

---

## Formato de Saída dos Shorts

| Propriedade | Valor |
|---|---|
| Resolução | 1080 × 1920 px (9:16) |
| Escalonamento | `scale=-2:1920` → escala pela altura |
| Recorte | `crop=1080:1920:(iw-1080)/2:(ih-1920)/2` → crop centralizado |
| Resultado visual | Vídeo preenche TODO o frame, sem barras pretas |
| Codec de vídeo | `libx264 -preset fast -crf 22` |
| Codec de áudio | `aac -b:a 128k` |
| Otimização web | `-movflags +faststart` |
| Nome do arquivo | `short_01.mp4`, `short_02.mp4` … |

---

## Comando FFmpeg Principal (Opção 2)

```bash
ffmpeg -y \
  -ss "CLIP_START" -to "CLIP_END" \
  -i "VIDEO_PATH" \
  -vf "scale=-2:1920,crop=1080:1920:(iw-1080)/2:(ih-1920)/2" \
  -c:v libx264 -preset fast -crf 22 \
  -c:a aac -b:a 128k -movflags +faststart \
  "OUTPUT_PATH"
```

**Por que `scale=-2:1920` + `crop` em vez de `scale+pad`:**
- `scale+pad` → encolhe o vídeo e adiciona barras pretas para "caber" no frame ❌
- `scale=-2:1920` → escala mantendo proporção, vídeo fica maior que o frame
- `crop=1080:1920` → recorta o centro → preenche 100% do frame ✅

Para um vídeo 16:9 (1920×1080):
- `scale=-2:1920` → 3413×1920
- `crop=1080:1920` → recorta 1080px do centro → Short perfeito

---

## Expressões n8n no Execute Command

No n8n 2.x, o campo `command` só resolve expressões se o valor começar com `=`:

```json
// ❌ Não resolvido — passa literal para o shell
"command": "ffprobe ... {{ $json.videoPath }}"

// ✅ Correto — = ativa modo expressão, {{ }} é resolvido antes do shell
"command": "=ffprobe ... {{ $json.videoPath }}"
```

Paths com espaços, parênteses ou acentos **precisam de aspas duplas**:
```bash
ffprobe ... "{{ $json.videoPath }}"
#           ^                    ^  aspas protegem qualquer nome de arquivo
```

---

## Setup Docker na VPS

### Dockerfile (FFmpeg + Whisper.cpp no n8n 2.x)

```dockerfile
ARG N8N_VERSION=latest
ARG ALPINE_VERSION=3.22

FROM alpine:${ALPINE_VERSION} AS apktools
RUN apk add --no-cache apk-tools-static

# Build whisper.cpp (transcrição local, sem API)
FROM alpine:${ALPINE_VERSION} AS whisperbuild
RUN apk add --no-cache git build-base cmake linux-headers
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /whisper.cpp \
    && cd /whisper.cpp \
    && cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j$(nproc) --config Release
RUN /whisper.cpp/models/download-ggml-model.sh base /whisper.cpp/models
RUN /whisper.cpp/models/download-ggml-model.sh small /whisper.cpp/models

FROM n8nio/n8n:${N8N_VERSION}
ARG ALPINE_VERSION
USER root

COPY --from=apktools /sbin/apk.static /sbin/apk.static
COPY --from=apktools /etc/apk/keys /tmp/apk-keys
RUN mkdir -p /etc/apk/keys \
    && cp -n /tmp/apk-keys/* /etc/apk/keys/ || true \
    && printf 'https://dl-cdn.alpinelinux.org/alpine/v%s/main\nhttps://dl-cdn.alpinelinux.org/alpine/v%s/community\n' \
       "$ALPINE_VERSION" "$ALPINE_VERSION" > /etc/apk/repositories \
    && /sbin/apk.static add apk-tools \
    && rm /sbin/apk.static \
    && apk add --no-cache ffmpeg libstdc++ libgomp \
    && rm -rf /var/cache/apk/*

# Binário whisper + libs + modelos ggml-base e ggml-small
COPY --from=whisperbuild /whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper
COPY --from=whisperbuild /whisper.cpp/build/src/libwhisper.so* /usr/local/lib/
COPY --from=whisperbuild /whisper.cpp/build/ggml/src/libggml*.so* /usr/local/lib/
RUN mkdir -p /models
COPY --from=whisperbuild /whisper.cpp/models/ggml-base.bin /models/ggml-base.bin
COPY --from=whisperbuild /whisper.cpp/models/ggml-small.bin /models/ggml-small.bin
ENV LD_LIBRARY_PATH=/usr/local/lib

USER node
```

### docker-compose.yml

```yaml
services:
  n8n:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - NODES_EXCLUDE=[]
      - N8N_RUNNERS_ENABLED=true
      - GENERIC_TIMEZONE=America/Sao_Paulo
    volumes:
      - n8n_data:/home/node/.n8n
      - /home/node/.n8n-files:/home/node/.n8n-files

volumes:
  n8n_data:
```

### Preparar pasta na VPS

```bash
mkdir -p /home/node/.n8n-files
chown -R 1000:1000 /home/node/.n8n-files
chmod 755 /home/node/.n8n-files
```

### Rebuild após mudanças

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker exec n8n ffmpeg -version   # verificar instalação
docker exec n8n ffprobe -version
```

---

## Arquivos do Projeto

| Arquivo | Conteúdo |
|---|---|
| `workflow-shorts-semantic.json` | Opção 1 — v18-semantic-local, Claude (até 5 clipes) + Whisper.cpp local + FFmpeg + Loop Over Items, 21 nodes, sem OpenAI |
| `workflow-shorts-simple.json` | Opção 2 — v16, FFmpeg + Whisper.cpp local, 14 nodes, $0 API |
| `workflow-shorts-simple-loop.json` | Opção 2 — v17-loop, igual ao v16 mas processa cada clipe sequencialmente via `Loop Over Items`, garantindo múltiplos Shorts por execução, 16 nodes |
| `n8n-video-silence-cutter.html` | App web para visualizar os pipelines e baixar os JSONs |
| `n8n-shorts-generator-contexto.md` | Este arquivo |
| `n8n-transcricao-contexto.md` | Contexto do workflow de transcrição completa em lote (`workflow-transcricao-completa.json`), separado deste arquivo |

---

## Histórico de Versões

| Versão | Mudança principal |
|---|---|
| v1–v3 | Webhook trigger, FFmpeg silencedetect básico |
| v4 | Adicionado Whisper + Claude, formato 9:16, legendas SRT |
| v5 | Trigger migrado para Google Drive; paths para `/home/node/.n8n-files/` |
| v6 | Prompt Claude com `hook`, `reason`, `autocontido`; upload de `_meta.json` |
| v7–v9 | Correções de sintaxe de expressão n8n (`{{ }}` vs `=\`\``) |
| v10 | Paths entre aspas duplas para nomes com espaços/parênteses |
| v11 | Consolidação de Execute Commands para evitar perda de paths |
| v12 | Arquitetura definitiva: Code Node sempre antes de Execute Command |
| v13 | Opção 2 reescrita sem nenhuma API (FFmpeg only) |
| v14 | Adicionado Read Binary File antes do Upload (FFmpeg não gera binário no n8n) |
| v15 | Crop centralizado (`scale=-2:1920 + crop`) — vídeo preenche frame todo sem barras; nome do arquivo simplificado para `short_01.mp4` |
| v16 | Adicionada legenda na Opção 2 via **whisper.cpp local** (modelo `base`, sem API): extrai áudio do clipe, transcreve com whisper-cli, queima `.srt` com `subtitles` + `force_style` no corte 9:16 |
| v17-loop | Novo arquivo `workflow-shorts-simple-loop.json`: insere `Loop Over Items` (Split In Batches, batchSize=1) após `Montar Clipes`, processando cada clipe sequencialmente (áudio → whisper → corte+legenda → upload) e voltando ao loop até processar todos os clipes |
| v18-semantic-local | Opção 1 reescrita: removida a OpenAI Whisper API — transcrição passa a ser feita com **whisper.cpp local** (vídeo inteiro), o `.srt` completo é enviado ao Claude, que escolhe **até 4 clipes**; adotado o mesmo padrão da Opção 2 (Loop Over Items, extrair áudio do clipe, whisper.cpp por clipe para legenda, corte 9:16 com crop centralizado); mantém upload de `_meta.json` (título, hook, motivo) por clipe |
| v18.1-semantic-local | Opção 1: limite elevado de **4 para 5 clipes** em todos os motores (Claude e Ollama), mantendo validação de duração (75–150s) e legenda por clipe opcional via toggle |

> Versões v19+ (workflow de transcrição completa em lote) foram movidas para [n8n-transcricao-contexto.md](n8n-transcricao-contexto.md).

---

## Próximos Passos Sugeridos

- [ ] Limpeza automática dos arquivos temporários após upload (`rm /home/node/.n8n-files/short_*.mp4 clip_*.{wav,srt,json}`)
- [ ] Notificação via Telegram/Slack ao concluir, com lista dos Shorts e duração de cada um
- [ ] Subpasta por vídeo original no Drive (`/Shorts/nome-do-video/short_01.mp4`)
- [ ] Thumbnail automática: capturar frame do segundo 2 de cada Short como capa
- [x] Adicionar legendas à Opção 2 — implementado em v16 com whisper.cpp local (sem API)
- [x] Remover OpenAI da Opção 1 e usar Claude para escolher até 4 clipes — implementado em v18-semantic-local
- [ ] Estabilizar e validar em produção o motor **Ollama local** como alternativa gratuita ao Claude na Opção 1 (já preparado no painel HTML, `buildSemanticWorkflow()` com `cfg.aiEngine = 'ollama'`: substitui `Claude — Gerar Clipes` por `Ollama — Gerar Clipes`, HTTP Request para `{ollamaUrl}/api/generate`, mesmo prompt, `format:'json'`, modelo configurável ex. `llama3.1:8b`)
