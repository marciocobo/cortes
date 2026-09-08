## Why

Hoje o Clip Studio só sabe cortar pregações: os dois pipelines existentes (Shorts/"Blocos" e Palavra Completa) filtram por fase de culto (abertura, avisos, dízimo/oferta, louvor, encerramento) e pontuam blocos pela lógica de retenção de uma pregação. O usuário quer usar o mesmo produto para cortar **podcasts de qualquer tipo** — conteúdo sem fases de culto, onde o que torna um trecho "cortável" é outra coisa (piada, insight, revelação, troca de ideia forte) — sem misturar essa lógica com a de pregação nem arriscar regredir os pipelines já em produção.

## What Changes

- **Novo seletor "Tipo de conteúdo" na aba Enviar Vídeo** (`SubmitForm.tsx`): `Pregação` (default, comportamento atual preservado) ou `Podcast`. Quando `Pregação` está selecionado, o toggle "Modo Palavra Completa" já existente continua funcionando como hoje. Quando `Podcast` está selecionado, a submissão vai para o novo pipeline de podcast (múltiplos clipes curtos, sem toggle de Palavra Completa).
- **Nova aba "Enviar arquivo"** ao lado de "Link do YouTube": permite enviar um arquivo de vídeo diretamente (sem link do YouTube), para podcasts (ou pregações) que já existem localmente e não estão publicados no YouTube. Usa o mesmo seletor de Tipo de conteúdo e o mesmo fluxo de fila/status.
- **`Submission.mode`** ganha um terceiro valor, `PODCAST`, ao lado de `SHORTS` e `PALAVRA_COMPLETA` já existentes — Shorts e Palavra Completa continuam intocados.
- **Novo workflow n8n dedicado a podcast** ("YouTube Podcast — Extração de Highlights"), construído nos mesmos moldes de "Blocos" (mesma trava de execução compartilhada, download via wget streaming, Whisper.cpp, "Mesclar Pausas Curtas", 2 passes de IA, teto de 180s por clipe, gap mínimo entre clipes, snap de silêncio simétrico, crop 9:16, fila própria com self-chaining e Schedule Trigger de segurança) — mas com os prompts de IA **100% reescritos para podcast**: sem filtro de fase de culto, com critérios de "momento de destaque" próprios de podcast (insight forte, piada, revelação, debate/contraponto, frase citável), e sem a extração de "nome do pregador" (que não se aplica).
- **Workflow de ingestão do n8n** ganha um segundo ramo de roteamento por `mode`: `PODCAST` sobe o vídeo para uma subpasta dedicada (`Videos-Cortes/Podcast`) e dispara o novo workflow de podcast, em vez de "Blocos" ou "Palavra Completa".
- **Ingestão por upload de arquivo**: novo caminho que recebe o arquivo de vídeo enviado pelo navegador (sem YouTube) e o entrega, via upload em blocos, direto na pasta de fila do pipeline correspondente ao `mode` da submissão — sem passar pelo `yt-dlp`.
- **Aba Vídeos do Clip Studio**: passa a listar também os clipes de `Videos-Cortes/Podcast/Cortes`, com um selo/badge "Podcast" distinguindo-os de Shorts e de Palavra Completa.
- **Nenhuma mudança** nos nodes, prompts, thresholds ou comportamento dos pipelines de Shorts ("Blocos") e Palavra Completa já em produção.

## Capabilities

### New Capabilities
- `podcast-clipping`: pipeline n8n dedicado que extrai múltiplos clipes curtos (30–180s) de um episódio de podcast, usando critérios de destaque específicos de podcast (não o filtro de fase de culto), reaproveitando a estrutura de 2 passes de IA, trava compartilhada, snap de silêncio e crop 9:16 já validados em "Blocos".
- `clip-studio/video-upload-ingestion`: caminho de envio que aceita um arquivo de vídeo enviado diretamente pelo navegador (sem link do YouTube) e o encaminha, via upload em blocos, para a fila do pipeline correspondente ao modo escolhido.

### Modified Capabilities
- `clip-studio/youtube-ingestion`: a submissão passa a aceitar um terceiro modo (`PODCAST`) além de `SHORTS`/`PALAVRA_COMPLETA`, com roteamento pós-download para o novo pipeline de podcast quando escolhido; a tela de envio ganha o seletor "Tipo de conteúdo" que determina esse modo.
- `clip-studio/video-library`: a listagem de clipes passa a incluir também a saída do pipeline de podcast, com uma indicação visual (badge "Podcast") distinguindo-a de Shorts e de Palavra Completa.

## Impact

- **Clip Studio (Next.js)**: `prisma/schema.prisma` (novo valor `PODCAST` no enum `SubmissionMode`, nova migration), `SubmitForm.tsx` (seletor "Tipo de conteúdo" + aba "Enviar arquivo"), `api/submissions/route.ts` (aceita/valida `mode=PODCAST` e o novo caminho de upload de arquivo), `dispatcher.ts`/`n8n-client.ts` (`triggerIngestion` propaga o novo modo; nova função para ingestão via upload), `VideoLibrary.tsx` + `n8n-client.ts` (`listClips`/`ClipSummary` ganham badge de podcast), poller/`isOriginalArchived` (passa a checar a pasta de arquivamento correta para `PODCAST`).
- **n8n**: workflow de ingestão ganha um terceiro ramo por `mode` e um novo caminho de upload direto de arquivo; novo workflow "Podcast — Extração de Highlights" publicado; webhook `clip-studio/clips` estendido para também listar `Videos-Cortes/Podcast/Cortes`; webhook `clip-studio/videos/check-archived` estendido para aceitar `mode=PODCAST`.
- **VPS**: a trava de execução (`.processing.lock`) passa a ser compartilhada entre três workflows (Blocos, Palavra Completa, Podcast) — todos competem pelo mesmo lock, nunca rodam whisper.cpp simultaneamente.
- Sem impacto em custo/infra além das chamadas de IA por vídeo em modo Podcast (mesmo padrão `makeAiNode`/credential nativa OpenAI já usado em "Blocos") e do tráfego adicional de upload direto de arquivo (proporcional ao tamanho do vídeo enviado).
