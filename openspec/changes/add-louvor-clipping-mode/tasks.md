## 1. Workflow n8n de Louvor: esqueleto (cópia estrutural do Podcast)

- [x] 1.1 Ler o workflow Podcast (`Zfwhv4pppJf3NhkR`) via MCP e mapear os nodes a copiar sem mudança: triggers, trava compartilhada, "Vídeo Encontrado?", "Trava Liberada?", download via wget, FFprobe + volumedetect, whisper.cpp `-mc 0`, upload em chunks, arquivamento, self-chaining e Schedule Trigger de 30 min.
- [x] 1.2 Criar o workflow "YouTube Louvor — Extração de Músicas e Trechos" com esses nodes, apontando fila, saída e arquivo para `Videos-Cortes/Louvor`, `Videos-Cortes/Louvor/Cortes` e `Videos-Cortes/Louvor/Videos`, criados de forma idempotente. Anexar as credenciais OneDrive/OpenAI via `setNodeCredential` e configurar `retryOnFail`/`onError` nos mesmos nodes dos outros pipelines.
- [x] 1.3 Implementar "Mesclar Pausas Curtas Louvor" com a checagem de transcrição suspeita (segmento com mais de 10 min, ou a mesma linha repetida mais de 30 vezes seguidas), gerando `transcriptSuspect`/`transcriptSuspectReason` sem abortar a execução (design, Decisão 5).

## 2. Workflow n8n de Louvor: IA e montagem

- [x] 2.1 Escrever "Preparar GPT — Analisar Blocos Louvor", que reaproveita o texto da regra de 6 fases do `sysAnalise` do Blocos e devolve só `{bloco, fase, reason}`.
- [x] 2.2 Escrever "Ranking dos Blocos Louvor", que mantém só `fase === 'louvor'` em código e une blocos contíguos em intervalos de louvor. Adicionar o IF "Louvor Encontrado?".
- [x] 2.3 Implementar o ramo "sem louvor encontrado": arquivar o original em `Louvor/Videos`, apagar o vídeo local e o `.processing.lock`, e terminar com sucesso e mensagem (design, Decisão 7).
- [x] 2.4 Escrever "Preparar GPT — Segmentar Músicas", com o SRT completo, os intervalos de louvor, a duração, o checklist de janelas restrito ao louvor, o aviso de `transcriptSuspect` e a instrução de timestamp em segundos. A saída é `{songs:[{title,start,end,highlights:[...]}]}`.
- [x] 2.5 Implementar "Montar Clipes Louvor":
  - parse robusto do JSON;
  - validações duras: música com pelo menos 60s, trecho entre 30 e 180s e contido na sua música, música dentro dos intervalos de louvor com ±20s, gap de 15s entre trechos, sem overlap entre músicas;
  - vizinhança `prev`/`next` por tipo;
  - nomes `louvor_musica_XX_`/`louvor_trecho_XX_`, com `_meta.json` usando o mesmo nome local e o campo `kind`;
  - `throw` com diagnóstico quando não sobrar nenhum item.
- [x] 2.6 Implementar "FFmpeg Cortar 9:16 Louvor":
  - crop central 9:16;
  - snap e threshold dinâmico dos Shorts;
  - `MAXEND` de 180s para trecho e `clipEnd+20` para música;
  - arquivo de estado do clamp separado por tipo;
  - sem filtro de áudio;
  - persistência de `real_start`/`real_end` no meta.
- [x] 2.7 Validar localmente: `new Function()` em todos os Code nodes, testes de runtime com dados fictícios em "Montar Clipes Louvor" e "Ranking dos Blocos Louvor" (incluindo zero louvor e música mais longa que 180s), e `sh -n` em todos os comandos bash.
- [x] 2.8 Publicar o workflow de Louvor (`publish_workflow`) e registrar o ID gerado. → `LvrCortesMusica1` (importado via `n8n import:workflow`; execução #4069 de fila vazia OK).

## 3. Workflow de ingestão (`mfqp4D5HKs0MNhv1`)

- [x] 3.1 Salvar um snapshot do workflow atual antes de qualquer mudança, para fazer diff nó a nó.
- [x] 3.2 Aceitar `LOUVOR` em "Normalizar Entrada", "Normalizar Entrada Upload" e "Normalizar Verificacao".
- [x] 3.3 Adicionar o IF "Rotear Louvor" na saída falsa de "Rotear Podcast", com a cadeia Louvor (criar/resolver pasta, sessão de upload, envio em blocos com quoting seguro, limpeza, callback e "Disparar Louvor" com o ID da tarefa 2.8).
- [x] 3.4 Estender os lookups de pasta e `workflowId` em "Normalizar Entrada Upload" com `LOUVOR`.
- [x] 3.5 Estender "Buscar em Videos-Cortes-Videos" com `Louvor/Videos/`.
- [x] 3.6 Adicionar a listagem de `Videos-Cortes/Louvor/Cortes`: pasta criada de forma idempotente, `onError: continueRegularOutput` e tag `Louvor/Cortes` em "Combinar Listagem de Clipes".
- [x] 3.7 Fazer o diff nó a nó contra o snapshot da tarefa 3.1 e confirmar que os ramos SHORTS, PALAVRA_COMPLETA e PODCAST e os demais webhooks ficaram byte a byte idênticos, exceto os nodes listados em 3.2 a 3.6. Chamar o webhook `clip-studio/clips` e confirmar que a listagem continua funcionando. Publicar.

## 4. Clip Studio

- [x] 4.1 `SubmitForm.tsx`: adicionar `"LOUVOR"` em `ContentType` e `SubmissionMode`, fazer `resolveMode` devolver `"LOUVOR"`, adicionar a pill "Louvor" e esconder o toggle Palavra Completa fora de Pregação.
- [x] 4.2 `api/submissions/route.ts` (zod) e `api/submissions/upload/init/route.ts`: aceitar `LOUVOR`.
- [x] 4.3 `n8n-client.ts`: adicionar `isFullSong` (via `kind` do meta, ou prefixo `louvor_musica_` como fallback) e atualizar o comentário "branch inalcançável" de `contentTypeFromSourceFolder`.
- [x] 4.4 `VideoLibrary.tsx`: adicionar o badge "Música completa" quando `isFullSong`, no padrão do badge Palavra Completa.
- [x] 4.5 Rodar `next build` e `eslint` sem erros. (`tsc` e `next build` limpos; `eslint` limpo nos arquivos alterados. Os 2 erros de `require()` em `server.js` já existiam antes desta change.)
- [x] 4.6 Deploy na VPS (`scp` + `docker compose up --build`, sem migration) e confirmar o container de pé.

## 5. Validação real

- [ ] 5.1 Smoke test por link do YouTube: um culto completo em modo Louvor, com status `Concluído`, músicas e trechos em `Videos-Cortes/Louvor/Cortes` e o original arquivado.
- [ ] 5.2 Smoke test por upload de arquivo em modo Louvor, até chegar na fila `Videos-Cortes/Louvor` e processar.
- [ ] 5.3 Na biblioteca, confirmar que o filtro Louvor mostra os clipes reais e que só as músicas completas têm o badge "Música completa".
- [ ] 5.4 Auditar os clipes com o agente `clipador`: nenhum clipe de pregação, avisos ou dízimo; fronteiras de música coerentes; trechos entre 30 e 180s e sem overlap.
- [ ] 5.5 Confirmar que não houve regressão: uma submissão Shorts ou Podcast depois do deploy segue normal.

## 6. Documentação

- [x] 6.1 Atualizar o CLAUDE.md com o modo Louvor (IDs de workflow, pastas, decisões e resultado da validação) e a nota de que fixes transversais precisam ser aplicados nos 4 pipelines.
