## Context

A motivação está em proposal.md. O que molda a abordagem:

- **Já existem três pipelines de corte independentes**, todos com o mesmo esqueleto:
  - "Blocos" (`ID4wisnN4Tqpt2zh`), "Palavra Completa" (`knWdWza8AxNht0oJ`) e "Podcast" (`Zfwhv4pppJf3NhkR`);
  - o esqueleto é: trava compartilhada, download via wget, whisper.cpp `large-v3-turbo -mc 0`, "Mesclar Pausas Curtas", 1ª IA (blocos), 2ª IA (seleção), "Montar Clipes", FFmpeg com snap de silêncio e clamp de colisão, upload em chunks, arquivamento e self-chaining.
  - O Podcast foi uma cópia estrutural do Blocos com prompts próprios. É o precedente direto para esta change.
- **O "Blocos" já classifica cada bloco com `fase ∈ {pregacao, abertura, avisos, dizimo_oferta, louvor, encerramento}`**, com exemplos de frases por fase. O Louvor precisa exatamente dessa classificação, só que com a seleção invertida.
- **O Clip Studio já reservou a infraestrutura de Louvor:**
  - `SubmissionMode.LOUVOR` no Prisma;
  - `contentTypeFromSourceFolder("Louvor/Cortes")` em `n8n-client.ts`;
  - a pill "Louvor" no filtro da biblioteca;
  - o label em `SubmissionHistory.tsx`.
  - Falta a entrada: o formulário, a validação das rotas e o workflow de ingestão.
- **O workflow de ingestão (`mfqp4D5HKs0MNhv1`) roteia por modo em três lugares:**
  - (a) link do YouTube, com o IF "Rotear por Modo" seguido do IF "Rotear Podcast" na saída falsa;
  - (b) upload direto, em "Normalizar Entrada Upload", que usa lookup `{mode: pasta}` e `{mode: workflowId}` sem ramificação;
  - (c) os webhooks utilitários "Combinar Listagem de Clipes" e "Buscar em Videos-Cortes-Videos".
  - As três "Normalizar ..." têm a lista de modos aceitos hardcoded (`['PALAVRA_COMPLETA','PODCAST']`). Qualquer outro modo cai silenciosamente em `SHORTS`.
- **Risco conhecido da VPS:** o bug de 02/09/2026 foi justamente o whisper.cpp alucinando em loop num trecho de louvor com música contínua. O `-mc 0` corrigiu isso. O pipeline de Louvor vai transcrever quase só música.

## Goals / Non-Goals

**Goals:**
- Pipeline de Louvor com o mesmo esqueleto operacional dos outros três: trava, fila, arquivo, self-chaining, retry e `onError` por clipe.
- Duas saídas por música: a música completa e os Shorts de trechos, conforme `specs/louvor-clipping/spec.md`.
- Mudanças no Clip Studio e na ingestão estritamente aditivas. Os ramos `SHORTS`, `PALAVRA_COMPLETA` e `PODCAST` ficam byte a byte idênticos.

**Non-Goals:**
- Crop por detecção de rosto (sidecar `podcast-crop-detector`). O Louvor usa crop central fixo. Ver Decisão 6.
- Reconhecimento de música por fingerprint de áudio ou catálogo externo. O título vem só da letra transcrita.
- Separação de voz e instrumental.
- Mudar o "Blocos". O louvor continua excluído dos Shorts de pregação.
- Legendas. Estão desabilitadas em todos os pipelines.

## Decisions

### 1. Novo workflow por cópia estrutural do "Podcast", não um modo dentro de um workflow existente

Pelo pedido explícito do usuário, este é um workflow n8n só para o louvor. Ele copia a estrutura do Podcast até "Mesclar Pausas Curtas", mesmo precedente de `add-podcast-clipping-mode`. Diverge nos prompts, em "Montar Clipes" e no corte.

- **Alternativa rejeitada:** um ramo `LOUVOR` dentro do "Blocos". Aumentaria o risco de regressão no pipeline de produção mais usado e contraria o pedido.
- **Custo aceito:** é mais um documento de workflow para manter em sincronia quando um fix transversal for aplicado, como retry, clamp ou snap de silêncio.

### 2. Duas passadas de IA: a 1ª classifica a fase dos blocos, a 2ª segmenta as músicas e escolhe os trechos

- **1ª IA ("Analisar Blocos Louvor"):** reaproveita o texto da regra de fases do `sysAnalise` do Blocos, com as mesmas 6 fases e os exemplos. Pede só `{bloco, fase, reason}`, sem os 7 critérios de retenção, porque aqui a pergunta é "é louvor?", não "é bom?".
  - "Ranking dos Blocos Louvor" mantém só os blocos com `fase === 'louvor'`. É o inverso determinístico da salvaguarda do Blocos, decidido em código e não no prompt.
  - Com zero blocos de louvor, a execução termina com sucesso pelo caminho "sem louvor encontrado". Ver Decisão 7.
- **2ª IA ("Segmentar Músicas"):** recebe só a transcrição dos intervalos de louvor da 1ª IA, com ±90s de margem (e não o culto inteiro, para gastar menos tokens e reduzir o viés de atenção em transcrição longa), a lista desses intervalos e a duração total. Os timestamps já chegam em segundos totais. Para não perder música por classificação conservadora, a 1ª IA é instruída a marcar `louvor` sempre que uma parte relevante do bloco for música cantada. Devolve:
  ```json
  { "songs": [ { "title", "start", "end",
                 "highlights": [ { "title", "start", "end", "hook", "reason" } ] } ] }
  ```
  - O prompt dá sinais de fronteira de música: mudança de letra ou tema, repetição de refrão, fala do ministro entre músicas ("vamos cantar", "levante as mãos"), aplausos e pausas.
  - Os trechos precisam ficar dentro da música.
  - Duração: 30 a 180s por trecho, música completa com no mínimo 60s.
  - Mantém a instrução explícita de timestamp em segundos e o checklist de janelas (N_BUCKETS) só sobre os intervalos de louvor, contra o viés de atenção em transcrição longa.
- **Alternativa rejeitada:** uma chamada única que classifica, segmenta e escolhe. A transcrição de um culto completo é longa. Separar a classificação de fase já se mostrou mais confiável no Blocos, e a 2ª IA ganha as âncoras de onde está o louvor.
- **Alternativa rejeitada:** segmentar as músicas só por áudio (energia/silêncio). Culto ao vivo tem cama instrumental contínua entre músicas, e o teclado segue tocando durante a fala. O silêncio não separa músicas de forma confiável. O áudio entra só como refinamento. Ver Decisão 4.

### 3. "Montar Clipes Louvor" valida em código as regras duras

Sem confiar no prompt, o node descarta:
- música com menos de 60s;
- trecho fora de 30 a 180s;
- trecho fora do intervalo da sua música;
- música fora dos intervalos de louvor da 1ª IA, com tolerância de ±20s para intro e outro.

Também aplica o gap mínimo de 15s entre trechos consecutivos e impede overlap entre músicas: se houver, a música posterior tem o início puxado para o fim da anterior.

Ele emite uma lista plana de itens `{kind: 'musica'|'trecho', clipStart, clipEnd, prevClipEnd, nextClipStart, outPath, metaPath, ...}`:
- a vizinhança (`prev`/`next`) é calculada por tipo, porque trechos só colidem com trechos e músicas só com músicas;
- um trecho fica naturalmente dentro da sua música, então essa sobreposição é intencional.

Nomes de arquivo:
- `louvor_musica_XX_<slug>.mp4` e `louvor_trecho_XX_<slug>.mp4`;
- o metadado usa o mesmo nome local, com `_meta.json`. Evita o bug histórico do node de upload que ignora `fileName`.

Se o total de itens válidos for zero, mas a 1ª IA encontrou louvor, a execução lança erro com diagnóstico. Mesmo padrão do "Montar Clipes" do Blocos: não é para passar silenciosamente.

### 4. Corte: música completa com snap largo, trecho com o snap dos Shorts

- **Trechos:** o mesmo bash de "FFmpeg Cortar 9:16" do Blocos, com:
  - threshold dinâmico (`mean_volume - 12dB`);
  - snap simétrico;
  - clamp de colisão com `.prev_clip_real_end`;
  - `MAXEND = ASTART + 180`.
- **Músicas completas:** o mesmo mecanismo de snap, mas sem o teto de 180s. O teto passa a ser `clipEnd + 20s`, só para achar a queda de energia no fim da música. Sem silêncio detectável, o snap cai no timestamp da IA, igual ao fallback atual.
- O arquivo de estado do clamp é separado por tipo (`.prev_clip_real_end_musica` e `_trecho`), para uma música não empurrar o início de um trecho.
- **Sem filtro de áudio.** A Palavra Completa usa `highpass/lowpass` para abafar música. Aqui a música é o conteúdo, e aplicar esse filtro seria um bug.

### 5. Transcrição: whisper.cpp com `-mc 0` e proteção contra segmento degenerado

O comando é o mesmo dos outros pipelines, com `-mc 0` obrigatório. Como o áudio é quase todo música, "Mesclar Pausas Curtas Louvor" ganha uma checagem barata:
- se algum segmento SRT passar de 10 minutos, ou se uma mesma linha se repetir mais de 30 vezes seguidas, a execução registra um aviso nos dados (`transcriptSuspect: true` e o motivo);
- ela não aborta. A 2ª IA recebe esse aviso no prompt para desconfiar da letra naquele trecho.
- **Alternativa rejeitada:** abortar a execução. Perderia o vídeo inteiro por causa de um trecho, e a segmentação ainda pode aproveitar as pausas e a fala entre as músicas.

### 6. Crop central fixo, sem o sidecar de detecção de rosto

O usuário escolheu 9:16 vertical. Em louvor, o ministro costuma ficar no centro do palco, enquanto no podcast há várias pessoas lado a lado. O sidecar `podcast-crop-detector` escolhe "quem fala" por movimento de boca. Num palco com vários vocalistas cantando ao mesmo tempo, esse critério é ambíguo por natureza e custa de 60 a 120s por clipe.

O crop fica fixo e central, com a mesma fórmula do Blocos. Revisitar se os clipes reais mostrarem o ministro fora do centro com frequência. Isso seria uma change separada.

### 7. Terminar sem erro quando não há louvor, sempre liberando a trava

"Ranking dos Blocos Louvor" com zero blocos `louvor` não lança exceção. Ele segue por um IF "Louvor Encontrado?". O ramo falso vai para um node que:
- move o original para `Videos-Cortes/Louvor/Videos`, para não reprocessar o mesmo vídeo a cada 30 min;
- apaga o vídeo local e o `.processing.lock`;
- termina com sucesso e uma mensagem.

Motivo: o bug real de trava órfã de 22/08/2026 aconteceu exatamente com um `throw` antes de "Limpar Vídeo Original". Como o arquivamento acontece, o Clip Studio marca a submissão como `Concluído`, com zero clipes. É aceitável: o vídeo foi processado e simplesmente não tinha louvor.

### 8. Ingestão: um IF novo encadeado e lookups estendidos

- **Link do YouTube:** a saída falsa de "Rotear Podcast" leva ao ramo Shorts ("Resolver Pasta Videos-Cortes"). O IF "Rotear Louvor" entra entre os dois: o verdadeiro vai para a cadeia do Louvor e o falso segue para o Shorts, cujos nodes não mudam (só ganham um salto a mais). A cadeia do Louvor é:
  - "Criar Pasta Louvor (idempotente)", "Resolver Pasta Louvor (Ingest)";
  - sessão de upload, envio em blocos, limpeza, callback de sucesso;
  - "Disparar Louvor".
  - É cópia exata do ramo Podcast, trocando pasta e `workflowId`. Os nós existentes não mudam.
- **Upload direto:** só se estendem os dois lookups em "Normalizar Entrada Upload" (`LOUVOR: 'Videos-Cortes/Louvor'` e o `workflowId` novo). "Criar Pasta Fila Upload (idempotente)" já é genérico.
- **As três normalizações de modo:** passam a aceitar `LOUVOR`, com a lista virando `['PALAVRA_COMPLETA','PODCAST','LOUVOR']`.
- **Listagem de clipes:**
  - dois nodes novos, "Resolver/Listar Arquivos Louvor Cortes". Não recriam a pasta a cada listagem, porque o próprio pipeline de Louvor já cria `Louvor/Cortes` de forma idempotente a cada execução;
  - "Combinar Listagem de Clipes" ganha `...tag(louvor, 'Louvor/Cortes')`;
  - se a pasta não existir, a listagem do louvor vira `[]` (`onError: continueRegularOutput`) e nunca derruba a biblioteca.
- **Checagem de arquivamento:** a expressão ganha `$json.mode === 'LOUVOR' ? 'Louvor/Videos/'`.

### 9. Clip Studio: aditivo, sem migration

- `SubmitForm.tsx`: `ContentType` passa a incluir `"LOUVOR"`, o `resolveMode` devolve `"LOUVOR"`, entra uma terceira pill, e o toggle Palavra Completa só aparece para Pregação (já é assim para Podcast).
- `api/submissions/route.ts` (zod) e `upload/init/route.ts` aceitam `LOUVOR`.
- `n8n-client.ts`:
  - novo campo `isFullSong`, derivado do prefixo `louvor_musica_` do nome do arquivo;
  - o metadado `kind` do `_meta.json` é a fonte preferida quando presente;
  - atualizar o comentário "branch inalcançável".
- `VideoLibrary.tsx`: badge "Música completa" quando `isFullSong`, no padrão do badge Palavra Completa.
- O Reprocessar funciona sem mudança: ele reenvia o mesmo `mode`.

## Risks / Trade-offs

- **[A letra transcrita de louvor é imprecisa e a fronteira entre músicas é ambígua]** → A 2ª IA usa vários sinais: fala do ministro, refrão e mudança de tema. "Montar Clipes" valida as regras duras. A precisão de fronteira será auditada com o agente `clipador` no primeiro vídeo real, com calibração esperada nos prompts, no mesmo padrão do Podcast.
- **[Nova alucinação do whisper em música contínua]** → `-mc 0` e o aviso `transcriptSuspect` da Decisão 5. Se ainda assim o louvor inteiro colapsar num segmento, a execução gera menos clipes, mas não trava.
- **[Músicas completas longas em 9:16 não são "Shorts"]** → Decisão explícita do usuário. O arquivo fica disponível na biblioteca, e o uso final é do usuário. Músicas com mais de 3 minutos não são aceitas como YouTube Shorts.
- **[Quarto pipeline disputando a trava]** → Com a VPS ociosa, cada pipeline só pega a trava quando tem vídeo na fila, então o risco é só aumentar a espera. O Schedule Trigger de 30 min, igual ao Podcast, reduz a latência quando a trava libera.
- **[Divergência futura entre os 4 workflows copiados]** → Registrar no CLAUDE.md que fixes transversais precisam ser aplicados nos 4.
- **[Erro na expressão de "Combinar Listagem de Clipes" derruba a biblioteca inteira]** → `onError` nos nodes novos de listagem, e validação do webhook `clip-studio/clips` antes e depois da mudança.

## Migration Plan

1. Criar e publicar o workflow de Louvor, que fica inerte enquanto `Videos-Cortes/Louvor` não existir ou estiver vazia.
2. Estender o workflow de ingestão:
   - fazer diff nó a nó para confirmar que os ramos existentes não mudaram;
   - publicar.
3. Deploy do Clip Studio na VPS com `scp` + `docker compose up --build`, sem migration.
4. Smoke test real com um culto curto por link do YouTube e outro por upload de arquivo, e auditoria dos clipes com o agente `clipador`.

**Rollback:** reverter o deploy do Clip Studio remove a opção Louvor da UI. O IF novo na ingestão e o workflow de Louvor podem ficar, porque ficam inertes sem submissões `LOUVOR`, ou podem ser despublicados.

## Open Questions

- Número máximo de trechos por música (padrão proposto: até 2) e de músicas por culto (sem teto). Ajuste fino de prompt depois do primeiro vídeo real, sem impacto em specs nem em tasks.
