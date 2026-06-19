# n8n Shorts Generator — Contexto do Projeto

## O que é este projeto

`n8n-video-silence-cutter.html` — arquivo HTML single-file que gera workflows JSON para o n8n automatizar o corte de YouTube Shorts a partir de vídeos longos (pregações/palestras) armazenados no OneDrive.

Fluxo geral: vídeo no OneDrive → whisper.cpp (transcrição local, sem pontuação) → IA avalia trechos → FFmpeg corta e redimensiona para 9:16.

Após cada mudança no HTML, o usuário precisa **reimportar o JSON gerado no n8n** — o workflow em produção não se atualiza sozinho.

---

## Arquitetura: 3 opções de workflow

| Opção | Nome | Pipeline |
|-------|------|----------|
| **Opção 1** | Semântico | whisper.cpp → IA (Claude/Gemini/Ollama/OpenAI) → Montar Clipes → FFmpeg |
| **Opção 2** | Simples | FFmpeg `silencedetect` only, sem IA |
| **Opção 3** | Blocos (2 passes) | whisper.cpp → IA score blocos 3min → IA seleção final → Montar Clipes → FFmpeg |

As 3 opções são geradas por funções separadas no `<script>`: `buildSimpleWorkflow()`, `buildSemanticWorkflow()`, `buildBlockWorkflow()`.

---

## Estrutura do código (dentro do `<script>`)

```
cfg {}                        ← configuração do usuário (lida do HTML pelo updateCfg())
buildSimpleWorkflow()         ← Opção 2
buildSemanticWorkflow()       ← Opção 1 (Claude/Gemini/Ollama/OpenAI)
buildBlockWorkflow()          ← Opção 3
```

Cada função monta um array `nodes[]` e retorna o JSON do workflow n8n.

### Parâmetros de cfg relevantes

| Variável | Default | Descrição |
|----------|---------|-----------|
| `cfg.minClip` (`MIN`) | 30 | Duração mínima do clipe (s) |
| `cfg.maxClip` (`MAX`) | 70 | Duração alvo/preferida do clipe (s) — usada nos prompts de IA |
| `cfg.minBlockScore` | 70 | Score mínimo para bloco passar na Opção 3 (40–55 para sermões lentos) |
| `cfg.noiseDb` | -30 | Threshold de ruído para `silencedetect` (dB) |
| `cfg.minSilence` | 0.4 | Duração mínima de silêncio detectado (s) |
| `cfg.margin` | 0.15 | Margem de segurança nos cortes (s) |

---

## Extensão por silêncio — invariante crítica

O `silencePrefix` (variável usada nos nodes FFmpeg das 3 opções) estende o `clipEnd` da IA até a próxima pausa natural de 0.8s+:

```bash
OEND={{ $json.clipEnd }}
MAXEND=$(awk -v s={{ $json.clipStart }} 'BEGIN{printf "%.3f", s+180}')
SRAW=$(ffmpeg -y -ss "$OEND" -t 45 -i "{{ $json.videoPath }}" \
  -af "silencedetect=noise=-30dB:duration=0.8" -f null - 2>&1 \
  | grep -m1 "silence_start" | awk '{print $NF}')
AEND=$(awk -v e="$OEND" -v r="$SRAW" -v m="$MAXEND" \
  'BEGIN{r=r+0; if(r>e && r<=m) printf "%.3f",r; \
   else if(e<=m) printf "%.3f",e; else printf "%.3f",m}')
```

**Por que SRAW é usado diretamente:** o FFmpeg com input seeking (`-ss` antes de `-i`) preserva os PTS absolutos do arquivo original. O `silencedetect` retorna timestamps **absolutos** (ex: 243s no arquivo), não relativos ao ponto de seek. Bug histórico: código antigo somava `OEND + SRAW` (ex: 120 + 243 = 363s) — sempre ultrapassava MAXEND e nunca estendia. Correto: usar `SRAW` diretamente como timestamp alvo.

**MAXEND = clipStart + 180** — teto absoluto = 3 min (máximo YouTube Shorts).

---

## Prompts de IA — estrutura PASSO 1 / PASSO 2

Todos os prompts de IA (Claude, Gemini, Ollama, Opção 3 sysFinal) usam chain-of-thought em 2 passos dentro de uma única chamada:

**PASSO 1 — PONTOS DE CONCLUSÃO:** a IA lê TODA a transcrição e mapeia 15–25 momentos onde o pregador conclui um pensamento completo (timestamp + resumo 5 palavras).

**PASSO 2 — SELEÇÃO DE CLIPES:** para cada clipe, `end` DEVE ser um dos pontos do PASSO 1, a partir de `start+40s` (sem teto fixo — captura o raciocínio completo).

**Por que PASSO 1 existe:** whisper.cpp não gera pontuação. Sem isso, a IA cortava em enumerações e vírgulas. O PASSO 1 garante que só timestamps de conclusão real sejam usados como `end`.

**Regras inegociáveis nos prompts:**
- `end` em ponto de conclusão real — NUNCA em enumeração, vírgula ou conjunção
- Cortes em pausas de fala, nunca no meio de palavra
- Clipe autocontido: quem assiste sem contexto entende início, meio e fim
- `conclusions` usa campo `t` (não `start`) — o código de Montar Clipes filtra por `start!=null`

---

## Limites de duração (sem cap rígido de 90s)

Após refatoração para capturar raciocínio completo:

- `MAXEND = clipStart + 180` (silencePrefix, 3 ocorrências — replace_all)
- `if (dur < MIN_DUR - 10 || dur > 180) continue` (Montar Clipes de todas as opções)
- PASSO 2: "a partir de start+40s (sem teto fixo — capture o raciocínio completo)"
- DURAÇÃO IDEAL nos prompts: "sem limite rígido: capture o raciocínio completo"

---

## Parse robusto do JSON da IA (Montar Clipes)

```javascript
let parsed;
try { parsed = JSON.parse(text); }
catch(_) {
  const m = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('IA nao retornou JSON. Resposta: ' + text.slice(0, 400));
  try { parsed = JSON.parse(m[0]); }
  catch(e) { throw new Error('JSON invalido: ' + e.message); }
}
const clips = (() => {
  if (Array.isArray(parsed)) return parsed;
  const c = parsed.clips || parsed.clipes || parsed.cortes;
  if (c) return c;
  const a = Object.values(parsed).filter(v => Array.isArray(v) && v.length > 0 && v[0] && v[0].start != null);
  return a[a.length-1] || [];
})().slice(0, 8);
```

**Opção 3** usa `raw` ao invés de `text` para ler a resposta da IA.

---

## Bugs já resolvidos — não regredir

| Bug | Causa | Fix |
|-----|-------|-----|
| Silêncio nunca extendia | `AEND = OEND + SRAW` — somava offset absoluto | Usar `SRAW` diretamente como timestamp |
| Pausas de respiração detectadas | `duration=0.4` (40ms) capturava micro-pausas | Mudar para `duration=0.8`, janela de 45s |
| Só 1 clipe retornado | PASSO 1 mapeava segmentos temáticos → PASSO 2 achava 1 sub-pensamento | Mudar para pontos de conclusão (15–25 endpoints) |
| "Montar Clipes não retornou nada" | Regex `[\s\S]*` greedy + chave `"clipes"` em PT ao invés de `"clips"` | Parse try/catch + fallback multi-chave |
| Clipe cortado no meio de frase | Cap de 90s sem extensão por silêncio | silencePrefix + PASSO 2 sem teto fixo |

---

## Fluxo de trabalho padrão

1. Editar `n8n-video-silence-cutter.html`
2. Abrir no browser → aba "Download" → gerar JSON (Semântico / Blocos / Simples)
3. Importar o JSON no n8n (substituir workflow anterior)
4. Testar com vídeo real no n8n
5. Se necessário, ajustar `minBlockScore` para 40–55 em sermões lentos

---

## Branch e estado git

Branch principal de desenvolvimento: `feature/inicial`  
Branch main: `main`  
Commits sem push são criados apenas quando o usuário pede explicitamente.
