## 1. Clip Studio — dados e envio

- [ ] 1.1 Adicionar `PODCAST` ao enum `SubmissionMode` no `prisma/schema.prisma`; migration não destrutiva
- [ ] 1.2 `SubmitForm.tsx`: seletor "Tipo de conteúdo" (`Pregação`/`Podcast`, default `Pregação`); toggle "Modo Palavra Completa" só aparece quando `Pregação` está selecionado; selecionar `Podcast` fixa `mode=PODCAST`
- [ ] 1.3 `SubmitForm.tsx`: nova aba "Enviar arquivo" ao lado de "Link do YouTube", com input de arquivo de vídeo, reaproveitando os mesmos campos de título e tipo de conteúdo
- [ ] 1.4 `POST /api/submissions`: aceitar/validar `mode=PODCAST` via zod
- [ ] 1.5 Nova rota `POST /api/submissions/upload` (ou equivalente): recebe o arquivo via streaming (sem carregar tudo em memória), cria a submissão e encaminha o arquivo para o novo webhook de upload do n8n
- [ ] 1.6 `triggerIngestion()`/`dispatcher.ts`: `mode=PODCAST` propagado no payload do webhook `clip-studio/ingest`
- [ ] 1.7 `n8n-client.ts`: nova função (ex. `triggerUploadIngestion`) que envia o arquivo para o webhook `clip-studio/ingest/upload`

## 2. n8n — roteamento no workflow de ingestão

- [ ] 2.1 Node IF/Switch "Rotear por Modo" estendido para um terceiro ramo `PODCAST` (sem alterar os ramos `SHORTS`/`PALAVRA_COMPLETA` existentes)
- [ ] 2.2 Ramo `PODCAST`: cria pasta `Videos-Cortes/Podcast` (idempotente) → sobe o vídeo baixado → dispara o novo workflow de Podcast (`execute_workflow`, fire-and-forget)
- [ ] 2.3 Novo webhook `clip-studio/ingest/upload`: recebe o arquivo de vídeo enviado pelo Clip Studio (sem YouTube URL), sobe para a pasta de fila correspondente ao `mode` recebido usando sessão de upload + PUT por chunk (mesmo padrão já usado no upload do clipe final de "Palavra Completa"), sem invocar `yt-dlp`
- [ ] 2.4 Publicar o workflow de ingestão atualizado

## 3. n8n — novo workflow "Podcast — Extração de Highlights"

- [ ] 3.1 Criar o workflow, com Schedule Trigger próprio (ex. a cada 30-60min) + Manual Trigger, mesmo padrão de "Blocos"/"Palavra Completa"
- [ ] 3.2 Nodes de fila/seleção: "Selecionar Vídeo Podcast" (varre `Videos-Cortes/Podcast`, filtro de tamanho mínimo), "Vídeo Encontrado? Podcast" (soft-fail sem erro quando fila vazia)
- [ ] 3.3 Nodes de trava: apontam para o **mesmo arquivo de lock compartilhado** já usado por "Blocos" e "Palavra Completa"
- [ ] 3.4 Nodes de download/transcrição: wget streaming, FFprobe + Extrair Áudio (calibração de `noiseThreshold`), Whisper.cpp Transcrever (`large-v3-turbo -t 6`), "Mesclar Pausas Curtas Podcast" — copiados do padrão de "Blocos"
- [ ] 3.5 Node "Dividir em Blocos Podcast" — copiado de "Blocos"
- [ ] 3.6 Node "Preparar GPT — Analisar Blocos (Podcast)": prompt reescrito com critérios de destaque de podcast (insight, humor, revelação, debate/contraponto, frase citável) em vez do filtro de fase de culto; mantém a regra de consistência numérica e o "filtro grosseiro, nota média para conteúdo comum" já corrigidos em "Blocos"
- [ ] 3.7 Node "Ranking dos Blocos Podcast": mesmo fallback consultivo (nunca trava a execução por zero blocos qualificados) já validado em "Blocos"
- [ ] 3.8 Node "Preparar GPT — Seleção Final (Podcast)": mesmo checklist de cobertura por janelas de tempo, mesmas regras de duração (teto 180s)/gap mínimo/timestamp já validadas em "Blocos", sem seção de fases excluídas e sem extração de nome do pregador
- [ ] 3.9 Node "Montar Clipes Podcast": mesma validação de duração/gap/timestamp e mesmo parser robusto de JSON de "Blocos"
- [ ] 3.10 Node "FFmpeg Cortar 9:16 Podcast": reaproveita o snap de silêncio simétrico e o threshold dinâmico de "Blocos", com crop 9:16, sem filtro de áudio adicional (ver design.md, Non-Goals)
- [ ] 3.11 Nodes de upload: clipes + `_meta.json` para `Videos-Cortes/Podcast/Cortes`, com `retryOnFail`
- [ ] 3.12 Node "Mover Vídeo Processado Podcast": arquiva o original em `Videos-Cortes/Podcast/Videos` (criada sob demanda), libera a trava compartilhada
- [ ] 3.13 Self-chaining: ao final, relista a fila própria e dispara a si mesmo se sobrar vídeo elegível
- [ ] 3.14 Publicar o workflow

## 4. n8n — extensão dos webhooks utilitários

- [ ] 4.1 `clip-studio/clips`: estender a cadeia de listagem para também consultar `Videos-Cortes/Podcast/Cortes` (mesmo padrão sequencial com `onError: continueRegularOutput` já usado para Palavra Completa), com `sourceFolder: "Podcast/Cortes"`
- [ ] 4.2 `clip-studio/videos/check-archived`: aceitar `mode=PODCAST` e checar `Videos-Cortes/Podcast/Videos`
- [ ] 4.3 Publicar os webhooks atualizados

## 5. Clip Studio — listagem e status

- [ ] 5.1 `n8n-client.ts`: `ClipSummary` ganha indicação de origem "Podcast" (`isPodcast`, análogo a `isFullWord`, a partir de `sourceFolder === "Podcast/Cortes"`)
- [ ] 5.2 `n8n-client.ts`: `isOriginalArchived(uploadedFileName, mode)` aceita `"PODCAST"` como valor válido
- [ ] 5.3 `poller.ts`: repassa `submission.mode` incluindo `PODCAST` sem mudança estrutural (já genérico desde a change de Palavra Completa)
- [ ] 5.4 `VideoLibrary.tsx`: badge "Podcast" renderizado no card quando `clip.isPodcast`

## 6. Validação local antes de publicar em produção

- [ ] 6.1 Todos os Code nodes novos/alterados (nos dois workflows n8n tocados) validados com `new Function()` contra o conteúdo real; nodes mais críticos (parser de resposta da IA, montagem de clipes, upload de arquivo em blocos) também testados em runtime com dados fictícios realistas
- [ ] 6.2 Comandos bash novos/alterados (trava, wget, ffprobe, whisper, ffmpeg com snap de silêncio + crop, limpeza) validados com `sh -n`
- [ ] 6.3 Confirmar via `get_workflow_details` que nenhum node dos ramos `SHORTS`/`PALAVRA_COMPLETA` do workflow de ingestão, nem nenhum node de "Blocos"/"Palavra Completa", teve `parameters` alterados por esta change
- [ ] 6.4 `npm install` + `npx next build` do Clip Studio: build limpo após as mudanças de schema/API/UI; `npx eslint` nos arquivos tocados
- [ ] 6.5 Testar manualmente o upload de arquivo grande (vários GB) na rota `/api/submissions/upload` contra um ambiente de teste, confirmando que não há erro de limite de tamanho de requisição nem estouro de memória no processo Next.js

## 7. Entrega

- [ ] 7.1 **Requer ação do usuário.** Smoke test end-to-end: 1 submissão em modo Podcast via link do YouTube contra um episódio curto de teste — confirmar fila, download, trava compartilhada (sem colidir com uma execução de "Blocos"/"Palavra Completa"), múltiplos clipes com crop 9:16, badge "Podcast" na aba Vídeos, status `Concluído`
- [ ] 7.2 **Requer ação do usuário.** Smoke test do upload de arquivo direto (qualquer modo) — confirmar que o arquivo chega à pasta de fila correta sem passar por `yt-dlp` e que o pipeline correspondente processa normalmente
- [ ] 7.3 **Requer ação do usuário.** Confirmar que uma submissão em modo Shorts ou Palavra Completa, disparada logo antes ou depois de 7.1/7.2, continua funcionando normalmente sem nenhuma regressão
- [ ] 7.4 Validar qualitativamente os primeiros clipes de podcast reais (ouvido humano ou agente `clipador`) contra os critérios de destaque — ajustar pesos do prompt se necessário (ver design.md, Open Questions)
- [ ] 7.5 Documentar no CLAUDE.md (seção "Estado atual"), incluindo o que ainda não foi validado com execução real
