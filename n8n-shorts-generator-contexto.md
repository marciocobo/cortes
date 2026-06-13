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
| Transcrição (Opção 1 apenas) | OpenAI Whisper API (`whisper-1`) |
| Análise semântica (Opção 1 apenas) | Anthropic Claude API (`claude-sonnet-4-6`) |

---

## Dois Workflows

### Opção 1 — Semântico (Whisper + Claude + FFmpeg)
Transcreve o vídeo, usa o Claude para identificar os melhores momentos semanticamente (gancho, conclusão, autocontido), gera legendas `.srt` queimadas e faz upload de cada Short com arquivo `_meta.json`.

### Opção 2 — Simples (FFmpeg only, zero custo de API)
Detecta silêncios por volume de áudio (`silencedetect`), agrupa blocos de fala em clipes de 75s–150s, converte para 9:16 com crop centralizado e faz upload. **Sem OpenAI, sem Anthropic, custo $0.**

---

## Fluxo Completo — Opção 2 (Simples, versão atual v15)

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
  → cada item do output tem: { clipStart, clipEnd, idx, videoPath, videoName, outPath }
  ↓
FFmpeg Cortar 9:16 (Execute Command)  ← recebe $json de Montar Clipes
  → corta o clipe, converte para 1080×1920 com scale+crop centralizado
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

**Total: 10 nodes | APIs: 0 | Custo: $0**

---

## Fluxo Completo — Opção 1 (Semântico, versão atual v12)

```
Google Drive Trigger
  ↓
Baixar Vídeo → Salvar na VPS
  ↓
Paths: Vídeo (Code) → { videoName, videoPath, audioPath }
  ↓
FFprobe + Extrair Áudio (Execute Command)
  → ffprobe mede duração
  → ffmpeg extrai WAV 16kHz mono para Whisper
  ↓
Paths: Áudio (Code) → passa paths + duration adiante
  ↓
Transcrever Whisper (HTTP Request → OpenAI)
  → verbose_json com timestamp por palavra
  ↓
Claude — Gerar Clipes (HTTP Request → Anthropic)
  → retorna JSON com start, end, title, hook, reason por clipe
  ↓
Montar Clipes (Code)
  → valida durações, gera .srt de legenda por clipe
  → cada item tem: { clipStart, clipEnd, srtContent, srtPath, outPath, videoPath, ... }
  ↓
FFmpeg Cortar (Execute Command)
  → salva .srt no disco
  → corta, converte 9:16 com crop, queima legendas
  ↓
Upload → Drive
```

**Total: 11 nodes**

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

### Dockerfile (FFmpeg no n8n 2.x)

```dockerfile
ARG N8N_VERSION=latest
ARG ALPINE_VERSION=3.22

FROM alpine:${ALPINE_VERSION} AS apktools
RUN apk add --no-cache apk-tools-static

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
    && apk add --no-cache ffmpeg \
    && rm -rf /var/cache/apk/*

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
| `workflow-shorts-semantic.json` | Opção 1 — v12, Whisper + Claude + FFmpeg, 11 nodes |
| `workflow-shorts-simple.json` | Opção 2 — v15, FFmpeg only, 10 nodes, $0 API |
| `n8n-video-silence-cutter.html` | App web para visualizar os pipelines e baixar os JSONs |
| `n8n-shorts-generator-contexto.md` | Este arquivo |

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

---

## Próximos Passos Sugeridos

- [ ] Limpeza automática dos arquivos temporários após upload (`rm /home/node/.n8n-files/short_*.mp4 clip_*.{wav,srt,json}`)
- [ ] Notificação via Telegram/Slack ao concluir, com lista dos Shorts e duração de cada um
- [ ] Subpasta por vídeo original no Drive (`/Shorts/nome-do-video/short_01.mp4`)
- [ ] Thumbnail automática: capturar frame do segundo 2 de cada Short como capa
- [ ] Adicionar legendas à Opção 2 usando Whisper como etapa opcional pós-corte
