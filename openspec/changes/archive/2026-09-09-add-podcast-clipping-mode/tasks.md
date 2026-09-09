## 1. Clip Studio — dados e envio

- [x] 1.1 Adicionar `PODCAST` ao enum `SubmissionMode` no `prisma/schema.prisma`; migration não destrutiva (`20260908190000_add_podcast_mode`). Também foi necessário tornar `Submission.youtubeUrl` opcional (`20260908190001_submission_youtube_url_nullable`) — detalhe mecânico exigido pela capability de upload de arquivo (1.5), não coberto explicitamente no design mas sem o qual a submissão por upload não tem como existir; guardado com fallback explícito no reprocess (ver nota abaixo)
- [x] 1.2 `SubmitForm.tsx`: seletor "Tipo de conteúdo" (`Pregação`/`Podcast`, default `Pregação`); toggle "Modo Palavra Completa" só aparece quando `Pregação` está selecionado; selecionar `Podcast` fixa `mode=PODCAST`
- [x] 1.3 `SubmitForm.tsx`: nova aba "Enviar arquivo" ao lado de "Link do YouTube", com input de arquivo de vídeo, reaproveitando os mesmos campos de título e tipo de conteúdo
- [x] 1.4 `POST /api/submissions`: aceitar/validar `mode=PODCAST` via zod
- [x] 1.5 Nova rota `POST /api/submissions/upload`: metadados na query string, corpo = bytes crus do arquivo (sem multipart), `request.body` (ReadableStream) repassado direto pro webhook n8n sem buffer
- [x] 1.6 `triggerIngestion()`/`dispatcher.ts`: `mode=PODCAST` propagado no payload do webhook `clip-studio/ingest`
- [x] 1.7 `n8n-client.ts`: `triggerUploadIngestion()` envia o stream para o webhook `clip-studio/ingest/upload` via `duplex:"half"`, sem passar por `callWebhook()` (JSON-only, com retry incompatível com stream de passagem única)
- [x] 1.8 (achado durante a implementação, fora da lista original) `/api/submissions/[id]/reprocess`: bloqueado explicitamente para submissões com `youtubeUrl == null` — reprocessar um upload de arquivo não tem como funcionar (bytes nunca persistidos por Clip Studio), e sem essa guarda o erro apareceria de forma confusa dentro de `triggerIngestion()`

## 2. n8n — roteamento no workflow de ingestão

- [x] 2.1 Novo node IF "Rotear Podcast" encadeado na saída FALSE de "Rotear por Modo" (que continua checando só `PALAVRA_COMPLETA`) — os ramos `SHORTS`/`PALAVRA_COMPLETA` existentes não tiveram nenhum parâmetro alterado, só a leitura de `mode` em "Normalizar Entrada" (agora aceita `PODCAST` além de `PALAVRA_COMPLETA`, com fallback pra `SHORTS`)
- [x] 2.2 Ramo `PODCAST`: "Criar Pasta Podcast (idempotente)" → "Resolver Pasta Podcast (Ingest)" → "Criar Sessao de Upload Podcast" → "Enviar Arquivo em Blocos Podcast" (upload em chunks, com a correção de quoting `"${PREFIX}"*`/`for part in "${PREFIX}"*` já aplicada preventivamente, embora `localPath` aqui nunca tenha espaço) → "Limpar Video Local Podcast" → "Callback Sucesso Podcast" → "Disparar Podcast" (execute_workflow, fire-and-forget, para `Zfwhv4pppJf3NhkR`)
- [x] 2.3 Novo webhook `POST /clip-studio/ingest/upload` (mesmo workflow de ingestão, `mfqp4D5HKs0MNhv1`): "Webhook Ingerir Video Upload" (`options.binaryData:true`) → "Normalizar Entrada Upload" (query string, calcula `queueFolderPath`/`targetWorkflowId` por `mode` via lookup, sem branching) → "Escrever Arquivo Local Upload" (`readWriteFile`, grava o binary recebido em disco) → "Resolver Pasta Fila Upload" → "Criar Sessao de Upload Video" → "Enviar Video em Blocos" (mesmo padrão de chunk-upload, já com o quoting seguro `"${PREFIX}"*`) → "Limpar Video Local Upload" → "Callback Sucesso Upload" → "Disparar Pipeline Upload" (workflowId dinâmico por expressão, não precisa de switch de 3 ramos); erros das 4 etapas de rede/disco convergem em "Preparar Erro Upload" → "Callback Erro Upload"; sem invocar `yt-dlp` em nenhum ponto
- [x] 2.4 Publicado — `activeVersionId` novo confirmado via `publish_workflow`

## 3. n8n — novo workflow "Podcast — Extração de Highlights" (`Zfwhv4pppJf3NhkR`)

- [x] 3.1 Workflow criado via SDK (skeleton com os 2 triggers) + 35 nodes adicionados via `update_workflow`/`addNode` em lote — Schedule Trigger "A Cada 30 Minutos" + "Iniciar Manualmente Podcast"
- [x] 3.2 "Selecionar Vídeo Podcast" (varre `Videos-Cortes/Podcast`) + "Vídeo Encontrado? Podcast" (soft-fail) — copiados 1:1 de "Blocos"
- [x] 3.3 "Verificar Trava de Execução (compartilhada)" aponta pro mesmo `/home/node/.n8n-files/.processing.lock` de "Blocos"/"Palavra Completa" — confirmado, mesmo caminho literal
- [x] 3.4 wget streaming, FFprobe+Whisper (`large-v3-turbo -t 6 -mc 0`), "Mesclar Pausas Curtas Podcast" — copiados de "Blocos", paths locais com sufixo `_podcast` só por clareza de debug (não é preciso pra correção, a trava já impede concorrência)
- [x] 3.5 "Dividir em Blocos Podcast" — copiado de "Blocos", nenhuma mudança
- [x] 3.6 "Preparar GPT — Analisar Blocos Podcast": prompt totalmente reescrito — sem REGRA DE EXCLUSÃO por fase de culto, critérios de destaque de podcast (revelação, humor, debate/contraponto, insight, frase citável), mesma REGRA DE CONSISTÊNCIA NUMÉRICA e framing "FILTRO GROSSEIRO"/nota BASE por critério já corrigidos em "Blocos"; conteúdo de baixo valor (publicidade lida, transição vazia) score baixo por critério, não por categoria
- [x] 3.7 "Ranking dos Blocos Podcast": mesmo fallback consultivo (nunca lança erro por zero blocos qualificados), mas **sem** o override categórico `score=0` por `fase` (não existe conceito de fase pra podcast — removido conforme o spec `podcast-clipping`, "SHALL NOT apply that sermon-phase filter")
- [x] 3.8 "Preparar GPT — Seleção Final Podcast": mesmo checklist de janelas, mesmo teto de 180s/gap 15s/formato de timestamp; REGRAS INEGOCIÁVEIS de fase removidas, substituídas por um parágrafo "QUALIDADE DO CONTEÚDO" orientando a evitar publicidade/transição vazia pelos próprios critérios, não por regra categórica; sem extração de nome do pregador
- [x] 3.9 "Montar Clipes Podcast": mesmo parser/validação de duração-gap-timestamp de "Blocos", regex de nome do pregador removida (slug usa só o título do clipe)
- [x] 3.10 "FFmpeg Cortar 9:16 Podcast": snap de silêncio simétrico + threshold dinâmico + crop 9:16 idênticos a "Blocos", sem filtro de áudio adicional (Non-Goal do design)
- [x] 3.11 Upload de clipes+meta pra `Videos-Cortes/Podcast/Cortes`, `retryOnFail` nos 2 nodes de upload (credenciais auto-atribuídas pelo MCP)
- [x] 3.12 "Mover Vídeo Processado Podcast": arquiva em `Videos-Cortes/Podcast/Videos`, libera a trava compartilhada (mesmo mecanismo de "Limpar Vídeo Original Podcast")
- [x] 3.13 Self-chaining: "Decidir Próximo Vídeo Podcast" → "Disparar Próximo Vídeo Podcast" (aponta pra si mesmo, `Zfwhv4pppJf3NhkR`)
- [x] 3.14 Publicado — `activeVersionId: 92cfe3a6-5754-425e-8e1e-3d5bfa367111`, zero nodes desconectados na validação final

## 4. n8n — extensão dos webhooks utilitários

- [x] 4.1 `clip-studio/clips`: cadeia estendida com "Resolver Pasta Podcast Cortes" → "Listar Arquivos Podcast Cortes" (mesmo padrão sequencial `onError: continueRegularOutput` já usado para Palavra Completa), "Combinar Listagem de Clipes" concatena os 3 arrays com `sourceFolder: "Podcast/Cortes"`
- [x] 4.2 `clip-studio/videos/check-archived`: "Normalizar Verificacao" aceita `PODCAST`; "Buscar em Videos-Cortes-Videos" monta a URL condicionalmente pras 3 pastas (`Videos/`, `PalavraCompleta/Videos/`, `Podcast/Videos/`)
- [x] 4.3 Publicado — `activeVersionId: fc49ab2f-aaa0-44c6-b1d7-b3b8588ebeb6`

## 5. Clip Studio — listagem e status

- [x] 5.1 `n8n-client.ts`: `ClipSummary.isPodcast` a partir de `sourceFolder === "Podcast/Cortes"`
- [x] 5.2 `n8n-client.ts`: `isOriginalArchived(uploadedFileName, mode)` aceita `"PODCAST"` (feito junto com o grupo 1, ao atualizar os tipos de `mode` em todo o arquivo)
- [x] 5.3 `poller.ts`: confirmado sem mudança necessária — já repassa `submission.mode` genericamente (tipo `SubmissionMode` do Prisma, já inclui `PODCAST` após a migration)
- [x] 5.4 `VideoLibrary.tsx`: badge "Podcast" (laranja `#f6a061`, para diferenciar do azul `#6199f6` de Palavra Completa) renderizado quando `clip.isPodcast`

## 6. Validação local antes de publicar em produção

- [x] 6.1 Todos os 15 Code nodes novos/alterados (13 no workflow Podcast + 2 no workflow de ingestão) validados com `new Function()`; a lógica de `Normalizar Entrada Upload` e do parser de mode/paths também testada em runtime com dados fictícios realistas (título com caracteres especiais, os 3 modos, submissionId vazio → erro esperado)
- [x] 6.2 Todos os 8 comandos bash novos/alterados (trava compartilhada, wget download/upload em chunks — já com o quoting seguro `"${PREFIX}"*` —, ffprobe, whisper, ffmpeg com snap de silêncio + crop) validados com `sh -n`
- [x] 6.3 Confirmado via `get_workflow_details` (diff programático nó a nó): os 20 nodes dos ramos `SHORTS`/`PALAVRA_COMPLETA` do workflow de ingestão têm `parameters` byte-a-byte idênticos aos de antes desta change — só `Normalizar Entrada` mudou (esperado, reconhece `PODCAST`). Nenhum node de "Blocos"/"Palavra Completa" foi tocado (esta change só criou o workflow novo `Zfwhv4pppJf3NhkR`, cópia independente)
- [x] 6.4 `npx next build` + `npm run lint` (projeto inteiro): build limpo, lint limpo, nas duas vezes que rodou (após o grupo 1 e após o grupo 5)
- [x] 6.5 Deploy em produção feito (código Clip Studio + migrations, ver CLAUDE.md) e teste real de upload de arquivo grande confirmado pelo usuário — sem timeout, servidor customizado (`server.js`) funcionando

## 7. Entrega

- [x] 7.1 Smoke test end-to-end confirmado pelo usuário: submissão em modo Podcast via link do YouTube completou com sucesso
- [x] 7.2 Smoke test do upload de arquivo direto confirmado pelo usuário
- [x] 7.3 Confirmado pelo usuário: Shorts/Palavra Completa continuam funcionando sem regressão
- [ ] 7.4 Validar qualitativamente os primeiros clipes de podcast reais (ouvido humano ou agente `clipador`) contra os critérios de destaque — ajustar pesos do prompt se necessário (ver design.md, Open Questions)
- [x] 7.5 Documentado no CLAUDE.md (seção "Estado atual"), incluindo a lista explícita do que ainda não foi validado com execução real
