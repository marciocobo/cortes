# n8n · YouTube Shorts Generator — Contexto do Projeto

## Visão Geral

Ferramenta HTML single-file (`n8n-video-silence-cutter.html`) que gera JSONs de workflow n8n importáveis diretamente no n8n. Cobre três estratégias de corte automático de YouTube Shorts a partir de vídeos longos armazenados no Google Drive.

---

## Infraestrutura

| Item | Valor |
|---|---|
| Plataforma de automação | n8n 2.25.7 (self-hosted, Docker) |
| Diretório de trabalho na VPS | `/home/node/.n8n-files/` |
| Fonte dos vídeos | Google Drive (pasta monitorada por trigger) |
| Google Drive Folder ID | `1wW1WhX1oyb4jbP0vQded403fQdmDMQQl` |
| Destino dos Shorts | Mesma pasta do Drive (`short_NN_<slug>.mp4`) |
| Processamento de vídeo | FFmpeg + ffprobe (instalados via Dockerfile customizado) |
| Transcrição | whisper.cpp local (modelo `ggml-small.bin`), sem API |
| Motores de IA disponíveis | Anthropic Claude (`claude-sonnet-4-6`), OpenAI (`gpt-5.4-mini`), Google Gemini (`gemini-2.0-flash`), Ollama local |

---

## Três Workflows

### Opção 1 — Semântico (IA + Whisper.cpp local + FFmpeg)
Transcreve o vídeo inteiro com whisper.cpp local, envia o SRT completo ao motor de IA escolhido (Claude, OpenAI, Gemini, Ollama), que identifica **de 5 a 8 dos melhores momentos** semanticamente usando 7 critérios combinados. Cada clipe é processado em loop: extrai áudio do trecho, gera legenda `.srt` via whisper.cpp (opcional), corta em 9:16 com crop centralizado, queima a legenda e faz upload do Short + `_meta.json`.

### Opção 2 — Simples (FFmpeg only, zero custo de API)
Detecta silêncios por volume de áudio (`silencedetect`), agrupa blocos de fala em clipes, converte para 9:16 com crop centralizado e faz upload. Sem IA, custo $0.

### Opção 3 — Blocos (2 passes de IA + Whisper.cpp local + FFmpeg)
Arquitetura de duas passagens:
1. **Dividir em blocos** de ~3 minutos a partir do SRT completo
2. **1º passe IA — Analisar Blocos**: pontua cada bloco de 0–100 com 7 critérios; descarta blocos abaixo do `minBlockScore` (padrão 70, configurável)
3. **Ranking dos Blocos**: ordena por nota, seleciona top 5 blocos qualificados
4. **2º passe IA — Seleção Final**: recebe blocos ranqueados + SRT completo e seleciona de 5 a 8 clipes com timestamps precisos
5. **Processamento**: mesmo pipeline de corte 9:16 + legenda + upload da Opção 1

O `_meta.json` de cada clipe inclui `retention_score` (do 2º passe), `block_score` e `criteria` (breakdown dos 7 critérios do 1º passe).

---

## 7 Critérios de Avaliação (Opções 1 e 3)

| # | Critério | Peso | Notas |
|---|---|---|---|
| 1 | Gancho inicial | 25 pts | Primeiros 3s prendem? Sem gancho = máx. 40pts no total |
| 2 | Emoção na fala | 20 pts | Surpresa, indignação, entusiasmo, empatia, urgência |
| 3 | Velocidade da fala | 10 pts | Ideal 1.5–3.5 p/s; fala lenta intencional (1–1.5 p/s, sermão/narração) = 7pts; <1 ou >4.5 = 3pts |
| 4 | Mudança de tom | 10 pts | Pergunta→resposta, problema→solução, exclamações |
| 5 | Palavras de impacto | 20 pts | segredo, erro, nunca, sempre, verdade, incrível, revelação… |
| 6 | Densidade de clipes (Opção 3) / Duração ideal (Opção 1) | 10 pts | Opção 3: blocos têm ~3min por design, avalia trechos isoláveis de 40–70s dentro do bloco |
| 7 | Retenção estimada | 5 pts | Início + desenvolvimento + conclusão ou cliffhanger |

---

## Regras de Corte (AI)

- **Duração**: mínimo 30s, ideal 40–70s; se o raciocínio não couber em 70s, o `end` pode avançar até completar o pensamento (máx. 180s)
- **Fim obrigatório**: o `end` deve cair no fim de um raciocínio completo (conclusão, resposta à pergunta, ou cliffhanger intencional). Proibido terminar em enumeração, vírgula ou conjunção
- **Cortes**: sempre em pausas de fala (nunca no meio de palavra ou frase)
- **Clipe autocontido**: quem assiste sem contexto deve entender início, meio e fim
- **Filtro no código**: clipes com `dur < minClip - 10` ou `dur > 180` são descartados

---

## Parâmetros Configuráveis (painel HTML)

| Campo | Padrão | Usado em |
|---|---|---|
| Duração mínima do clipe | 30s | Opções 1, 2, 3 |
| Duração máxima do clipe | 70s | Opções 1, 2, 3 (soft limit — pode extender até 180s) |
| Nota mínima dos blocos | 70 | Opção 3 apenas |
| Limiar de silêncio | -30 dB | Opção 2 apenas |
| Duração mínima do silêncio | 0.4s | Opção 2 apenas |
| Margem de frames | 0.15s | Opção 2 apenas |
| Idioma | pt | Todas (whisper.cpp) |
| Resolução | 1080×1920 | Todas |
| Legendas | habilitadas | Todas |
| Estilo de legenda | palavra a palavra | Todas |
| Motor de IA | Claude / OpenAI / Gemini / Ollama / Nenhum | Opções 1 e 3 |

---

## Formato de Saída dos Shorts

| Propriedade | Valor |
|---|---|
| Resolução | 1080 × 1920 px (9:16) |
| Escalonamento | `scale=-2:1920` → escala pela altura |
| Recorte | `crop=1080:1920:(iw-1080)/2:(ih-1920)/2` → crop centralizado |
| Codec de vídeo | `libx264 -preset fast -crf 22` |
| Codec de áudio | `aac -b:a 128k` |
| Otimização web | `-movflags +faststart` |
| Sincronização de legenda | `setpts=PTS-STARTPTS` antes do filtro `subtitles=` (evita drift de PTS) |
| `_meta.json` | `index, title, slug, hook, reason, retention_score, block_score, criteria, start, end, duration, videoSource` |

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

---

## Arquivos do Projeto

| Arquivo | Conteúdo |
|---|---|
| `n8n-video-silence-cutter.html` | App HTML single-file — gera JSONs de workflow n8n para as 3 opções; painel de configuração completo; prévia dos nodes; download direto |
| `n8n-shorts-generator-contexto.md` | Este arquivo |
| `n8n-transcricao-contexto.md` | Contexto do workflow de transcrição completa em lote (`workflow-transcricao-completa.json`) |

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
| v14 | Adicionado Read Binary File antes do Upload |
| v15 | Crop centralizado (`scale=-2:1920 + crop`); nome do arquivo com slug |
| v16 | Legendas na Opção 2 via whisper.cpp local (sem API) |
| v17-loop | Loop Over Items na Opção 2 — múltiplos Shorts por execução |
| v18-semantic-local | Opção 1 reescrita: whisper.cpp local substitui OpenAI Whisper; Loop Over Items; upload de `_meta.json` |
| v18.1 | Limite de clips da Opção 1 elevado para 5; suporte a Ollama |
| v19+ | Workflow de transcrição completa em lote (ver `n8n-transcricao-contexto.md`) |
| v20 — Opção 3 | Arquitetura 2 passes: blocos 3min → IA analisa e pontua (0–100) → ranking → IA seleciona clipes finais. Suporte a Claude, OpenAI (`gpt-5.4-mini`), Gemini |
| v20.1 | Pontuação de blocos 0–100; descarte de blocos < `minBlockScore` (padrão 70, configurável); score incluído no `_meta.json` |
| v20.2 | Duração parametrizada: min 30s, ideal 40–70s, max 70s (soft); detecção de silêncio isolada para Opção 2; campo idioma movido para card Legendas |
| v20.3 | Sincronização de legenda: `setpts=PTS-STARTPTS` adicionado antes do filtro `subtitles=` nas 3 opções (evita drift de PTS com input seeking) |
| v20.4 | 7 critérios de avaliação combinados em todos os prompts (Gancho, Emoção, Velocidade, Tom, Impacto, Duração/Densidade, Retenção); `retention_score` e `criteria` no `_meta.json` |
| v20.5 | Critério de velocidade recalibrado: fala lenta intencional (1–1.5 p/s) = 7pts, não penaliza pregação/narração; critério 6 na Opção 3 renomeado para "Densidade de clipes" (não penaliza duração do bloco de 3min) |
| v20.6 | Campo "Nota mínima dos blocos" configurável no painel (padrão 70); threshold injetado no `rankingCode` via `cfg.minBlockScore` |
| v20.7 | Corte no fim do raciocínio: `end` pode ultrapassar `maxClip` até completar o pensamento (máx. 180s); filtro de duração atualizado de `MAX_DUR + 15` para `180s`; prompts reforçados para nunca terminar em enumeração ou frase em aberto |
| v20.8 | Limite de clipes alterado de "até 5" para "de 5 a 8" em todas as engines e no sysFinal |

---

## Próximos Passos Sugeridos

- [ ] Limpeza automática dos arquivos temporários após upload (`rm /home/node/.n8n-files/short_*.mp4 clip_*.{wav,srt,json}`)
- [ ] Notificação via Telegram/Slack ao concluir, com lista dos Shorts e duração de cada um
- [ ] Subpasta por vídeo original no Drive (`/Shorts/nome-do-video/short_01.mp4`)
- [ ] Thumbnail automática: capturar frame do segundo 2 de cada Short como capa
- [x] Legendas na Opção 2 — implementado em v16
- [x] Whisper.cpp local na Opção 1 — implementado em v18-semantic-local
- [x] Opção 3 com 2 passes de IA e blocos de 3min — implementado em v20
- [x] Suporte a OpenAI (`gpt-5.4-mini`) e Gemini — implementado em v20
- [x] Cortes no fim do raciocínio (não truncar para caber no tempo) — implementado em v20.7
- [ ] Validar em produção o motor Ollama local como alternativa gratuita
