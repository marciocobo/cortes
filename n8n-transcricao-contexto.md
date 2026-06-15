# n8n · Transcrição Completa — Contexto do Projeto

## Visão Geral

Workflow n8n para gerar a **transcrição completa** (`.srt` com timestamps + `.txt` em texto puro) de vídeos **e áudios** armazenados no Google Drive, **sem usar IA generativa** (sem Claude/Ollama/OpenAI) — apenas whisper.cpp local. Roda em lote: lista todos os arquivos da pasta, pula arquivos que já têm transcrição gerada e processa os pendentes sequencialmente, do menor para o maior.

**Formatos aceitos:** vídeo (`.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`) e áudio (`.m4a`, `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`).

---

## Infraestrutura

| Item | Valor |
|---|---|
| Plataforma de automação | n8n 2.25.7 (self-hosted, Docker) |
| Diretório de trabalho na VPS | `/home/node/.n8n-files/` |
| Fonte dos vídeos | Google Drive (mesma pasta usada pelos workflows de cortes) |
| Google Drive Folder ID | `1wW1WhX1oyb4jbP0vQded403fQdmDMQQl` |
| Destino das transcrições | Mesma pasta do Drive (`<slug>_transcricao.srt`, `<slug>_transcricao.txt`) |
| Transcrição | whisper.cpp local (modelo `ggml-small`), sem API, custo $0 |

> **Pré-requisito de infraestrutura:** o binário `whisper`, o FFmpeg e os modelos `ggml-base`/`ggml-small` são instalados via o mesmo Dockerfile customizado usado pelos workflows de cortes — ver seção "Setup Docker na VPS" em [n8n-shorts-generator-contexto.md](n8n-shorts-generator-contexto.md). É preciso que o modelo `ggml-small.bin` esteja presente em `/models/`.

---

## Workflow — Transcrição Completa em Lote (sem IA generativa)

`workflow-transcricao-completa.json`: roda manualmente (botão "Execute workflow"), **lista todos os arquivos da pasta do Drive**, identifica quais vídeos ainda não têm transcrição gerada e processa cada um sequencialmente, apenas com **whisper.cpp local** (sem Claude/Ollama/OpenAI), usando o modelo `ggml-small` (melhor precisão em PT-BR que o `base`, mantendo custo $0).

```
Executar Manualmente
  ↓
Listar Arquivos (Google Drive: lista todos os arquivos da pasta)
  ↓
Selecionar Vídeos Pendentes (Code)
  → filtra apenas vídeos/áudios (.mp4/.mov/.mkv/.avi/.webm/.m4a/.mp3/.wav/.aac/.ogg/.flac)
  → remove acentos/diacríticos do nome do arquivo (cleanName) — usado para salvar na VPS
  → para cada arquivo, calcula slug (a partir do nome sem acentos) e nomes esperados <slug>_transcricao.srt/.txt
  → SE ambos já existem na pasta (pelo nome) → pula esse arquivo (já transcrito)
  → SENÃO → inclui na lista de pendentes com todos os paths calculados (videoPath já usa o nome sem acentos)
  → ordena a lista de pendentes do MENOR para o MAIOR arquivo (fileSize)
  ↓
Loop Over Items (Split In Batches, batchSize=1) — processa cada vídeo pendente sequencialmente, do menor para o maior
  ↓
Baixar Vídeo → Salvar na VPS
  ↓
Preparar Paths Clipe (Code) → repassa paths calculados (fileId, videoPath, audioPath, srtBase/srtPath/txtPath, srtName/txtName)
  ↓
Extrair Áudio Completo (ffmpeg → WAV 16kHz mono do vídeo inteiro)
  ↓
Preparar Whisper (Code) → repassa paths
  ↓
Whisper.cpp Transcrever Completo
  → whisper -m /models/ggml-small.bin -f audioPath -l pt -osrt -otxt -of srtBase -np -t $(nproc)
  → gera <slug>_transcricao.srt (com timestamps) e <slug>_transcricao.txt (texto puro)
  ↓
Preparar Leitura SRT → Ler SRT do Disco → Upload SRT → Drive
  ↓
Preparar Leitura TXT → Ler TXT do Disco → Upload TXT → Drive
  ↓
volta ao Loop Over Items até processar todos os vídeos pendentes
```

**Total: 16 nodes | APIs: 0 | Custo: $0** (transcrição via whisper.cpp local, modelo `small`)

**Critério de "já transcrito":** o vídeo `aula01.mp4` é considerado transcrito se a pasta já contém **tanto** `aula01_transcricao.srt` **quanto** `aula01_transcricao.txt`. Se faltar qualquer um dos dois, o vídeo é reprocessado.

> **Atenção:** o node "Listar Arquivos" usa `resource: fileFolder` / `operation: search` com filtro por `folderId` e `options.fields: [id, name, size, mimeType]` — o campo `size` precisa ser pedido explicitamente, senão a API do Drive não retorna o tamanho do arquivo e a ordenação por tamanho não funciona. Dependendo da versão do node Google Drive instalada no n8n, pode ser necessário reabrir o node na UI, reselecionar a pasta/opção "Return All" e confirmar que "size" está marcado nos campos retornados.

### Desempenho do whisper.cpp

Se a VPS já tem 4 (ou menos) cores, `-t $(nproc)` não muda nada — o whisper.cpp já usava o máximo. O gargalo real para o modelo `small` em CPU costuma ser o **beam search** (decodificação): por padrão o whisper.cpp usa `-bs 5` (beam size 5), que avalia 5 hipóteses em paralelo a cada passo — ou seja, ~5x mais trabalho de decodificação que o necessário.

O comando agora inclui `-bs 1` (decodificação greedy, 1 hipótese por passo), que normalmente reduz o tempo de transcrição de forma drástica (na prática, várias vezes mais rápido), com perda de qualidade pequena/imperceptível na maioria dos casos:

```
whisper -m /models/ggml-small.bin -f audioPath -l pt -osrt -otxt -of srtBase -np -t $(nproc) -bs 1
```

Se ainda estiver lento depois disso:
- Confirmar quantos cores a VPS tem (`nproc`) — em VPS com 1-2 cores vCPU compartilhado, o processamento de áudios longos é inevitavelmente lento.
- Trocar `ggml-small.bin` por `ggml-base.bin` no comando (modelo menor, ~2x mais rápido, um pouco menos preciso).
- Considerar um modelo quantizado (ex. `ggml-small-q5_1.bin`, baixado via `download-ggml-model.sh small-q5_1`) — usa menos memória/banda e roda mais rápido com perda mínima de qualidade.
- Evitar rodar a transcrição em paralelo com os workflows de cortes (que também usam ffmpeg/whisper) — disputam CPU.

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

## Arquivos do Projeto

| Arquivo | Conteúdo |
|---|---|
| `workflow-transcricao-completa.json` | Transcrição completa em lote via whisper.cpp local (modelo `small`): lista a pasta do Drive, pula vídeos já transcritos (`.srt`+`.txt` existentes) e processa os pendentes sequencialmente, 16 nodes, $0 API |
| `n8n-transcricao-contexto.md` | Este arquivo |

---

## Histórico de Versões

| Versão | Mudança principal |
|---|---|
| v19-transcricao | Novo workflow `workflow-transcricao-completa.json`: transcrição completa do vídeo (sem cortes, sem IA generativa), usando whisper.cpp local com modelo `ggml-small` (melhor precisão em PT-BR que `base`); gera `.srt` (com timestamps) e `.txt` (texto puro) e envia ambos ao Drive; Dockerfile atualizado para baixar também `ggml-small.bin` |
| v20-lote | `workflow-transcricao-completa.json` reescrito: trigger manual + lista todos os arquivos da pasta do Drive, filtra vídeos sem transcrição (verifica se `<slug>_transcricao.srt` e `.txt` já existem) e processa os pendentes sequencialmente via `Loop Over Items`, evitando retrabalho |

---

## Próximos Passos Sugeridos

- [ ] Limpeza automática dos arquivos temporários após processamento (`rm /home/node/.n8n-files/*_full.wav`)
- [ ] Notificação via Telegram/Slack ao concluir o lote, com lista dos vídeos transcritos
- [ ] Subpasta de transcrições no Drive (`/Transcricoes/<slug>_transcricao.srt`)
