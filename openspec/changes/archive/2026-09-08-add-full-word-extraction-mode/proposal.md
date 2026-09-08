## Why

Hoje, ao enviar um link do YouTube na aba **Enviar Vídeo** do Clip Studio, o vídeo sempre segue para o pipeline de Shorts ("Blocos"), que corta múltiplos clipes curtos (30–180s). O usuário quer, no mesmo formulário de envio, poder escolher extrair em vez disso **"a palavra" inteira** — o trecho contínuo da pregação, do início ao fim, como um único clipe — descartando abertura, avisos, dízimo/oferta, louvor e encerramento, e atenuando música/teclado de fundo que eventualmente comece a tocar enquanto o pregador ainda fala. O resultado deve aparecer na aba Vídeos junto com os Shorts, sem alterar em nada o pipeline de Shorts já em produção.

## What Changes

- **Toggle na aba Enviar Vídeo** (`SubmitForm.tsx`): novo campo "Modo Palavra Completa" ao lado de título/link. Quando marcado, a submissão é processada por um pipeline separado em vez do pipeline de Shorts — mutuamente exclusivo por submissão (uma submissão gera OU Shorts OU o clipe único, nunca os dois).
- **`Submission.mode`** (novo campo, enum `SHORTS` (default) | `PALAVRA_COMPLETA`) persistido no Postgres do Clip Studio e propagado até o webhook de ingestão do n8n.
- **Workflow de ingestão do n8n** (o workflow separado que já baixa via `yt-dlp` e sobe pro OneDrive, distinto de "Blocos") ganha uma ramificação por `mode`: `SHORTS` mantém o comportamento atual (upload em `Videos-Cortes`, dispara "Blocos"); `PALAVRA_COMPLETA` sobe o vídeo em uma subpasta dedicada (`Videos-Cortes/PalavraCompleta`) e dispara um **novo workflow n8n** dedicado, em vez de "Blocos".
- **Novo workflow n8n "Palavra Completa"**, construído nos mesmos moldes de "Blocos" (mesma trava de execução — **compartilhada** com "Blocos", para não rodar 2 whisper.cpp ao mesmo tempo na VPS de 6 vCPUs —, download via wget, Whisper.cpp, "Mesclar Pausas Curtas", fila própria com self-chaining e Schedule Trigger de segurança), mas divergindo depois da transcrição: uma única chamada de IA identifica o início e o fim contínuos da pregação (reaproveitando o filtro de 5 fases já validado em "Blocos"), um node monta **um único clipe** (sem teto de 180s, sem crop 9:16 — mantém a proporção original do vídeo), e o corte final aplica um filtro de áudio ffmpeg (highpass/lowpass) para atenuar música/teclado de fundo.
- **Aba Vídeos do Clip Studio**: passa a listar também o clipe único de "Videos-Cortes/PalavraCompleta/Cortes", com um selo/badge diferenciando-o dos Shorts normais.
- **Nenhuma mudança** nos nodes, prompts, thresholds ou comportamento do workflow de Shorts ("Blocos", `ID4wisnN4Tqpt2zh`) já em produção.

## Capabilities

### New Capabilities
- `full-word-extraction`: pipeline n8n dedicado que extrai um único clipe contínuo cobrindo toda a pregação de um culto (excluindo abertura/avisos/dízimo/louvor/encerramento), mantendo o formato original do vídeo e atenuando música/teclado de fundo via filtro ffmpeg best-effort.

### Modified Capabilities
- `clip-studio/youtube-ingestion`: a submissão passa a aceitar um modo (`SHORTS`/`PALAVRA_COMPLETA`) escolhido no envio, e o roteamento pós-download passa a depender desse modo — continua sem modificar o pipeline "Blocos" em si, apenas decide para qual dos dois pipelines (Blocos ou o novo Palavra Completa) o vídeo baixado é encaminhado.
- `clip-studio/video-library`: a listagem de clipes passa a incluir também a saída do pipeline Palavra Completa, com uma indicação visual (badge) de que aquele item é um clipe único de palavra completa, não um Short.

## Impact

- **Clip Studio (Next.js)**: `prisma/schema.prisma` (novo enum + campo `mode` em `Submission`, nova migration), `SubmitForm.tsx` (toggle), `api/submissions/route.ts` (aceita/valida `mode`), `dispatcher.ts`/`n8n-client.ts` (`triggerIngestion` propaga `mode`), `VideoLibrary.tsx` + `n8n-client.ts` (`listClips`/`ClipSummary` ganham indicação de origem/badge), poller/`isOriginalArchived` (passa a checar o local de arquivamento correto conforme o `mode` da submissão).
- **n8n**: workflow de ingestão (separado de "Blocos") ganha uma ramificação por `mode`; novo workflow "Palavra Completa" publicado; webhook `clip-studio/clips` (usado por `listClips()`) estendido para também listar `Videos-Cortes/PalavraCompleta/Cortes`; webhook `clip-studio/videos/check-archived` estendido para aceitar o modo e checar o local de arquivamento correspondente.
- **VPS**: a trava de execução (`.processing.lock`) passa a ser compartilhada entre "Blocos" e "Palavra Completa" — ambos competem pelo mesmo lock, nunca rodam whisper.cpp simultaneamente.
- Sem impacto em custo/infra além de 1 chamada de IA adicional por vídeo em modo Palavra Completa (mesmo padrão `makeAiNode`/credential nativa OpenAI já usado em "Blocos").
