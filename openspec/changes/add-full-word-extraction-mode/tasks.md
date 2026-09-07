## 1. Clip Studio — dados e envio

- [x] 1.1 `enum SubmissionMode { SHORTS PALAVRA_COMPLETA }` + campo `mode SubmissionMode @default(SHORTS)` em `Submission`; migration manual `20260907180000_add_submission_mode` (`prisma generate` validado)
- [x] 1.2 Toggle "Modo Palavra Completa" em `SubmitForm.tsx`, com hint, default desmarcado (`SHORTS`)
- [x] 1.3 `POST /api/submissions`: `mode` aceito/validado via zod (`z.enum(["SHORTS","PALAVRA_COMPLETA"]).default("SHORTS")`), persistido no `Submission`
- [x] 1.4 `triggerIngestion()`/`dispatcher.ts`: `mode` propagado no payload do webhook `clip-studio/ingest`

## 2. n8n — roteamento no workflow de ingestão

- [x] 2.1 Node IF "Rotear por Modo" adicionado após "Baixar Video YouTube" (só a conexão de entrada do ramo SHORTS mudou — de "direto" para "via Rotear por Modo, saída falsa" —, nenhum parâmetro dos nodes do ramo SHORTS foi tocado)
- [x] 2.2 Ramo `SHORTS` (saída falsa do IF): aponta para "Resolver Pasta Videos-Cortes" exatamente como antes — nenhum node do ramo teve parâmetros alterados
- [x] 2.3 Ramo `PALAVRA_COMPLETA` (saída verdadeira): "Criar Pasta Palavra Completa (idempotente)" (POST idempotente, `conflictBehavior:"fail"`, `onError:continueRegularOutput`) → "Resolver Pasta Palavra Completa (Ingest)" → "Criar Sessao de Upload PC" → "Enviar Arquivo em Blocos PC" → "Limpar Video Local PC" → "Callback Sucesso PC" → "Disparar Palavra Completa" (`execute_workflow` para `knWdWza8AxNht0oJ`, fire-and-forget)
- [x] 2.4 Publicado — `activeVersionId: d4182d7a-5132-4e70-a748-1bacb14d1304`

## 3. n8n — novo workflow "Palavra Completa"

- [x] 3.1 Criar o workflow (novo, nome sugerido "YouTube Palavra Completa — Extração Contínua"), com Schedule Trigger próprio (ex. a cada 30-60min) + Manual Trigger, mesmo padrão de "Blocos" — criado via n8n MCP, id `knWdWza8AxNht0oJ`, Schedule Trigger a cada 30min + Manual Trigger
- [x] 3.2 Nodes de fila/seleção: "Selecionar Vídeo Palavra Completa" (varre `Videos-Cortes/PalavraCompleta`, filtro de tamanho mínimo 1MB), "Vídeo Encontrado? PC" (soft-fail sem erro quando fila vazia), reaproveitando o texto/lógica já validada em "Blocos"
- [x] 3.3 Nodes de trava: "Verificar Trava de Execução (compartilhada)"/"Aplicar Trava PC"/"Trava Liberada? PC" apontam para o **mesmo arquivo de lock** já usado por "Blocos" (`/home/node/.n8n-files/.processing.lock`) — confirmado, mesmo caminho literal nos dois workflows
- [x] 3.4 Nodes de download/transcrição: wget streaming, FFprobe + Extrair Áudio (com calibração de `noiseThreshold`), Whisper.cpp Transcrever (`large-v3-turbo -t 6`), "Mesclar Pausas Curtas PC" — copiados do padrão de "Blocos"
- [x] 3.5 Node "Preparar GPT — Limites da Palavra" (Code): monta o prompt reaproveitando a regra de exclusão de 5 fases já validada em "Blocos", pedindo `{sermonStart, sermonEnd, title, reason}`
- [x] 3.6 Node HTTP "GPT — Limites da Palavra": padrão `specifyBody:"keypair"`/credential nativa OpenAI (`Nbuq36KrXwL1exNW`), com `retryOnFail`
- [x] 3.7 Node "Montar Clipe Único" (Code): parser robusto de JSON, validação de duração mínima de sanidade (60s), monta paths/nome de arquivo reaproveitando a extração de nome do pregador de "Blocos"
- [x] 3.8 Node "FFmpeg Cortar Palavra Completa": reaproveita o snap de silêncio simétrico e o threshold dinâmico de "Blocos" (sem clamp de vizinho, que não se aplica a 1 clipe só), sem `-vf crop=...`, com `-af "highpass=f=200,lowpass=f=3000"`
- [ ] 3.9 **Não feito nesta sessão** — não havia um trecho de áudio real com música/teclado de fundo conhecido disponível para testar localmente o filtro. Recomendado validar com o agente `clipador` (ou ouvido humano) no primeiro vídeo real processado antes de considerar o filtro calibrado.
- [x] 3.10 Nodes de upload: clipe + `_meta.json` para `Videos-Cortes/PalavraCompleta/Cortes`, `retryOnFail`
- [x] 3.11 Node "Mover Vídeo Processado PC": arquiva o original em `Videos-Cortes/PalavraCompleta/Videos` (criado sob demanda via "Criar Pasta Videos PC" idempotente), libera a trava compartilhada
- [x] 3.12 Self-chaining: ao final, relista a fila própria e dispara a si mesmo (execute_workflow apontando para o próprio id) se sobrar vídeo elegível
- [x] 3.13 Publicar o workflow — publicado, `activeVersionId: d805f631-ab0a-4d5c-bd52-0712f6e8d21b`

## 4. n8n — extensão dos webhooks utilitários

- [x] 4.1 `clip-studio/clips`: cadeia estendida (sequencial, sem Merge node) — "Listar Arquivos Cortes" → "Resolver Pasta Palavra Completa Cortes" (onError continueRegularOutput, tolera pasta ainda não existir) → "Listar Arquivos Palavra Completa Cortes" (idem) → "Combinar Listagem de Clipes" (Code, concatena os dois arrays com `sourceFolder: "Cortes"`/`"PalavraCompleta/Cortes"`)
- [x] 4.2 `clip-studio/videos/check-archived`: "Normalizar Verificacao" agora também extrai `mode` do body; "Buscar em Videos-Cortes-Videos" monta a URL condicionalmente (`Videos-Cortes/Videos/...` vs `Videos-Cortes/PalavraCompleta/Videos/...`)
- [x] 4.3 Publicado — `activeVersionId: 7923b7d2-734a-400e-88d5-fd23bc2dd116`

## 5. Clip Studio — listagem e status

- [x] 5.1 `n8n-client.ts`: `GraphDriveItem.sourceFolder` (tag vinda do webhook) + `ClipSummary.isFullWord` (`sourceFolder === "PalavraCompleta/Cortes"`)
- [x] 5.2 `n8n-client.ts`: `isOriginalArchived(uploadedFileName, mode)` — parâmetro novo, default `"SHORTS"`, repassado no body do webhook
- [x] 5.3 `poller.ts`: `isOriginalArchived(submission.uploadedFileName, submission.mode)`
- [x] 5.4 `VideoLibrary.tsx`: badge "Palavra Completa" renderizado no card quando `clip.isFullWord`

## 6. Validação local antes de publicar em produção

- [x] 6.1 Todos os Code nodes novos/alterados (nos dois workflows n8n) validados com `new Function()` contra o conteúdo real armazenado em produção; "Mesclar Pausas Curtas PC" e "Montar Clipe Único" também testados em runtime com dados fictícios realistas (merge de pausa de respiração vs. pausa real; parse da resposta da IA com sermão válido e com `sermonStart/sermonEnd: null` → `[]`)
- [x] 6.2 Comandos bash novos/alterados (trava, wget, ffprobe, whisper, ffmpeg com snap de silêncio + filtro de áudio, limpeza) validados com `sh -n` a partir do conteúdo real armazenado em produção
- [x] 6.3 Confirmado via `get_workflow_details`: os 6 nodes do ramo `SHORTS` (Resolver Pasta Videos-Cortes, Criar Sessao de Upload, Enviar Arquivo em Blocos, Limpar Video Local, Callback Sucesso, Disparar Esteira Blocos) têm `parameters` byte-a-byte idênticos aos capturados antes de qualquer mudança desta sessão — só a conexão de entrada mudou (via "Rotear por Modo", saída falsa)
- [x] 6.4 `npm install` + `npx next build` do Clip Studio: build limpo (18 rotas, TypeScript sem erros) após as mudanças de schema/API/UI; `npx eslint` nos arquivos tocados também sem erros

## 7. Entrega

- [ ] 7.1 **Pendente — requer ação do usuário.** Smoke test end-to-end: 1 submissão em modo Palavra Completa contra um vídeo curto de teste — confirmar fila, download, trava compartilhada (sem rodar junto com uma execução de "Blocos"), clipe único sem crop, filtro de áudio aplicado, badge na aba Vídeos, status `Concluído`. Não disparado nesta sessão de propósito: envolve custo real de whisper.cpp/ffmpeg/OpenAI na VPS de produção e a escolha de um vídeo de teste é uma decisão do usuário.
- [ ] 7.2 **Pendente — requer ação do usuário.** Confirmar que uma submissão em modo Shorts, disparada logo antes ou depois de 7.1, continua produzindo Shorts normalmente sem nenhuma regressão.
- [x] 7.3 Documentado no CLAUDE.md (seção "Estado atual"), incluindo a lista explícita do que ainda não foi validado com execução real
