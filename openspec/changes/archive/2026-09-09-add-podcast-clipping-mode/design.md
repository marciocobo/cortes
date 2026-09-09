## Context

Ver proposal.md - Why para a motivação. Estado atual relevante (a change `add-full-word-extraction-mode` já estabeleceu o padrão de modo múltiplo — ver `openspec/changes/add-full-word-extraction-mode/design.md` — e, segundo o CLAUDE.md do projeto, já está implementada em produção mesmo que ainda não arquivada/sincronizada nas specs):

- `Submission.mode` já existe no Postgres do Clip Studio como enum (`SHORTS` | `PALAVRA_COMPLETA`, default `SHORTS`), propagado do formulário de envio até o webhook de ingestão do n8n.
- O envio de vídeo (`SubmitForm.tsx` → `POST /api/submissions`) só aceita um link do YouTube hoje — não existe caminho de upload de arquivo.
- O workflow de ingestão do n8n (separado de "Blocos") já ramifica por `mode`: `SHORTS` sobe para `Videos-Cortes` e dispara "Blocos"; `PALAVRA_COMPLETA` sobe para `Videos-Cortes/PalavraCompleta` e dispara o workflow "Palavra Completa" (`knWdWza8AxNht0oJ`).
- "Blocos" (`ID4wisnN4Tqpt2zh`) e "Palavra Completa" já compartilham a mesma trava de execução (`/home/node/.n8n-files/.processing.lock`) na VPS Alpine hardened de 6 vCPUs, cada um com fila própria (self-chaining) e Schedule Trigger de segurança.
- A aba Vídeos (`VideoLibrary.tsx`) já lista clipes de duas pastas (`Videos-Cortes/Cortes` e `Videos-Cortes/PalavraCompleta/Cortes`) via o webhook `clip-studio/clips`, com badge para Palavra Completa.
- O poller (`isOriginalArchived`) já aceita um parâmetro `mode` e checa a pasta de arquivamento correspondente.
- "Palavra Completa" já usa um padrão de upload em blocos (sessão de upload OneDrive + PUT por chunk) para subir seu clipe final sem carregar o arquivo inteiro na memória do n8n — o mesmo padrão que a ingestão por upload de arquivo desta change precisa para receber vídeos potencialmente grandes vindos do navegador.

## Goals / Non-Goals

**Goals:**
- Seletor "Tipo de conteúdo" (Pregação/Podcast) no formulário de envio já existente — não uma tela nova.
- `Podcast` como um terceiro valor de `SubmissionMode`, roteado só no workflow de ingestão (já isolado de "Blocos" e "Palavra Completa" por design anterior) — nenhum dos dois pipelines de pregação é tocado.
- Novo workflow de podcast construído "nos mesmos moldes" do que já existe (trava compartilhada, fila+self-chaining, Schedule Trigger, `retryOnFail`/`onError`, snap de silêncio, crop 9:16, teto de 180s, gap mínimo) — reaproveitando padrões já validados em produção.
- Prompts de IA do pipeline de podcast **totalmente novos**: sem filtro de fase de culto, com critérios de destaque de podcast.
- Novo caminho de ingestão por upload direto de arquivo, disponível tanto para Podcast quanto para Pregação (não é exclusivo de podcast, mas nasce motivado por ele).
- Resultado visível na aba Vídeos, junto dos Shorts e do Palavra Completa, com badge próprio.

**Non-Goals:**
- Mudar qualquer node, prompt, threshold ou comportamento dos workflows "Blocos" ou "Palavra Completa" em produção.
- Diarização/identificação de falantes no podcast (quem disse o quê) — fora de escopo; os clipes são selecionados por conteúdo, não por atribuição de fala.
- Separação de voz/música real ou qualquer tratamento de áudio especial para podcast além do que "Blocos" já faz — podcasts tipicamente não têm cama musical contínua como um culto, então o filtro highpass/lowpass de Palavra Completa não é replicado aqui.
- Limite de tamanho de arquivo para upload direto além do que a infraestrutura (Next.js, OneDrive, VPS) já suporta para os vídeos de pregação hoje baixados via `yt-dlp` (arquivos de vários GB já são tratados via streaming, não há razão para um teto artificial menor).

## Decisions

### 1. `SubmissionMode` ganha um terceiro valor `PODCAST`, não um campo/eixo separado
Alternativa descartada: um campo booleano `isPodcast` independente de `mode`, cruzado com `SHORTS`/`PALAVRA_COMPLETA`. Rejeitada — o usuário já decidiu explicitamente que Podcast é "um terceiro modo independente" com pipeline próprio, não uma variação de Shorts/Palavra Completa. Um único enum de 3 valores mantém o poller (`isOriginalArchived`) e a listagem (`sourceFolder`/badge) simples, seguindo exatamente o padrão já estabelecido quando `PALAVRA_COMPLETA` foi adicionado.

### 2. UI: seletor "Tipo de conteúdo" (Pregação/Podcast) controla qual segundo controle aparece
`SubmitForm.tsx` ganha um seletor de pills "Tipo de conteúdo": `Pregação` (default) ou `Podcast`. Quando `Pregação` está selecionado, o toggle "Modo Palavra Completa" já existente continua aparecendo e decide entre `SHORTS`/`PALAVRA_COMPLETA`. Quando `Podcast` está selecionado, esse toggle é ocultado (Palavra Completa não se aplica a podcast — decisão do usuário: podcast só tem o formato de múltiplos clipes) e o modo é fixado em `PODCAST`. Alternativa descartada: manter os dois toggles sempre visíveis simultaneamente (Tipo de conteúdo + Palavra Completa) mesmo quando Podcast está selecionado. Rejeitada por confundir o usuário com uma opção que não faz sentido (Palavra Completa é um conceito de pregação).

### 3. Novo workflow n8n "Podcast — Extração de Highlights", copiado da estrutura de "Blocos"
Reaproveita (copiado, não referenciado — workflows n8n são documentos separados) os nodes já validados de "Blocos": Verificar/Aplicar Trava (mesmo arquivo de lock compartilhado), download via wget streaming, FFprobe + Extrair Áudio (com calibração de `noiseThreshold`), Whisper.cpp Transcrever (`large-v3-turbo -t 6`), "Mesclar Pausas Curtas", "Dividir em Blocos", os 2 passes de IA (bloco → seleção final), "Montar Clipes" (teto 180s, gap mínimo, snap de silêncio simétrico), "FFmpeg Cortar 9:16" (com crop, sem filtro de áudio adicional). Diverge nos dois prompts de IA:
- `GPT — Analisar Blocos (Podcast)`: substitui a REGRA DE EXCLUSÃO OBRIGATÓRIA (fases de culto) por critérios de destaque de podcast — insight forte, humor, revelação, debate/contraponto, frase citável — com a mesma calibração "filtro grosseiro, nota média para conteúdo comum" já corrigida em "Blocos" (ver CLAUDE.md, "Bug corrigido — IA zerava criteria"), para não repetir o mesmo viés de ancoragem para nota baixa.
- `GPT — Seleção Final (Podcast)`: mesmo checklist de cobertura por janelas de tempo e mesmas regras de duração/gap/timestamp já validadas em "Blocos", sem a seção de fases excluídas e sem a extração de "nome do pregador" (substituída por, no máximo, o título do episódio já fornecido pelo usuário no envio).

Fila própria (`Videos-Cortes/Podcast`) + self-chaining + Schedule Trigger próprio (sugestão inicial: a cada 30-60min, mesmo raciocínio de "Palavra Completa" — mais frequente que os 6h de "Blocos" porque compete pelo mesmo lock).

Alternativa descartada: parametrizar "Blocos" para aceitar um modo de prompt diferente em vez de duplicar o workflow. Rejeitada pelo mesmo motivo já registrado na change de Palavra Completa — o usuário quer "Blocos" 100% intocado, e um parâmetro de modo dentro dele criaria acoplamento e risco de regressão no pipeline de pregação já em produção.

### 4. Trava de execução COMPARTILHADA entre os três workflows
"Podcast" checa/adquire o mesmo `/home/node/.n8n-files/.processing.lock` que "Blocos" e "Palavra Completa" já usam — não um lock próprio. Mesma razão já documentada: a VPS tem 6 vCPUs e dois whisper.cpp simultâneos já travaram a VPS por 17h+ no passado (13/07/2026, CLAUDE.md). Três workflows competindo pelo mesmo lock, cada um com seu Schedule Trigger de segurança, garante que eventualmente todos processam sem rodar em paralelo.

### 5. Ingestão por upload de arquivo reaproveita o padrão de upload em blocos já existente em "Palavra Completa"
Fluxo: navegador → `POST` para uma nova rota Next.js (`/api/submissions/upload` ou equivalente) que faz streaming do corpo da requisição para disco temporário no servidor do Clip Studio (sem carregar tudo em memória, mesmo cuidado já documentado para o download do n8n) → a rota chama um novo webhook n8n (`clip-studio/ingest/upload`) que recebe o arquivo e o sobe para a pasta de fila do `mode` correspondente usando o mesmo mecanismo de sessão de upload + PUT por chunk já implementado para o clipe final de "Palavra Completa" (`Criar Sessao de Upload`/`Enviar em Blocos`, agora usado para o vídeo INTEIRO de entrada em vez de um clipe já cortado). Isso evita reinventar um mecanismo de upload grande e evita depender do `yt-dlp` (não há URL).

Alternativa descartada: Clip Studio subir o arquivo direto pro OneDrive usando uma credential própria (sem passar pelo n8n). Rejeitada — o Clip Studio nunca guardou credenciais do OneDrive diretamente (arquitetura já estabelecida: toda integração com OneDrive passa pelo n8n via webhook, com a credencial vivendo só lá), e mudar isso é um salto de escopo maior que o necessário para esta change.

Alternativa descartada: exigir que o arquivo caiba num único `POST` sem streaming/chunking. Rejeitada — episódios de podcast/pregação já observados no projeto chegam a vários GB (ex. 10GB+ em 4K), o mesmo problema de memória já documentado para o download via node nativo do OneDrive (13/07/2026) se repetiria aqui na direção contrária (upload) se não for feito em streaming.

### 6. Webhook `clip-studio/clips` estendido para 3 pastas
O Code node desse webhook n8n passa a consultar também `Videos-Cortes/Podcast/Cortes`, junto das duas pastas já consultadas (`Cortes`, `PalavraCompleta/Cortes`), concatenando o resultado com o campo `sourceFolder` já usado para derivar `mode`/badge. Mesmo padrão, só mais uma origem.

### 7. Poller (`isOriginalArchived`) e webhook `check-archived` estendidos para `mode=PODCAST`
Passam a aceitar `PODCAST` como terceiro valor válido, checando `Videos-Cortes/Podcast/Videos` como pasta de arquivamento — mesma extensão condicional já feita para `PALAVRA_COMPLETA`.

## Risks / Trade-offs

- **[Risco] Critérios de "destaque de podcast" são mais subjetivos que o filtro de fase de culto (que tem sinais textuais claros como "vamos orar", "separe sua oferta")** → Mitigação: mesma abordagem de "filtro grosseiro com nota média para conteúdo comum" já corrigida em "Blocos" após o bug de scoring degenerado; validar com o agente `clipador` (ou ouvido humano) nos primeiros episódios reais antes de considerar os prompts calibrados.
- **[Risco] Podcasts em vídeo landscape podem ter mais de um participante em quadro, e o crop 9:16 (herdado de "Blocos") pode cortar um dos participantes fora do enquadramento** → Mitigação: aceito conscientemente como comportamento inicial (mesma convenção de Shorts); se isso se mostrar um problema real com vídeos de teste, é um ajuste de crop (ex. crop dinâmico por rosto) que pode ser proposto como change futura sem reabrir esta.
- **[Risco] Upload direto de arquivo grande pelo navegador pode ser lento/instável em conexões residenciais** → Mitigação aceita conscientemente: o caminho por link do YouTube continua disponível e preferível quando o vídeo já está publicado; upload de arquivo é para o caso em que não há alternativa.
- **[Risco] Três pipelines competindo pelo mesmo lock pode aumentar a espera de qualquer um deles em dias com fila cheia nos três** → Mitigação: mesma aceita conscientemente já registrada para Palavra Completa — preferível a travar a VPS; cada um tem Schedule Trigger próprio, então eventualmente todos processam sem intervenção manual.
- **[Trade-off] Sem separação de voz/diarização, um clipe de podcast pode incluir uma pergunta do apresentador cortada pela metade se a IA errar o `start`** → mesma limitação estrutural já documentada para "Blocos" (bug pendente de cortes mid-reasoning); os mesmos mecanismos de mitigação (checklist de pontos de conclusão, snap de silêncio) se aplicam igualmente aqui.

## Migration Plan

1. Prisma migration: adicionar `PODCAST` ao enum `SubmissionMode` — não destrutivo, nenhuma submissão existente muda de valor.
2. Publicar o novo workflow "Podcast — Extração de Highlights" no n8n (separado, não afeta "Blocos" nem "Palavra Completa" nem o workflow de ingestão até o passo 3).
3. Atualizar o workflow de ingestão (terceiro ramo por `mode` + novo webhook de upload de arquivo) e os webhooks `clip-studio/clips`/`clip-studio/videos/check-archived` (extensão para a 3ª pasta), publicar.
4. Deploy do Clip Studio com o seletor "Tipo de conteúdo", a aba "Enviar arquivo", `mode=PODCAST` no payload, e badge "Podcast" na aba Vídeos.
5. Smoke test: 1 submissão em modo Podcast via link do YouTube contra um episódio curto de teste — confirmar fila, download, trava compartilhada, múltiplos clipes com crop 9:16, badge na aba Vídeos, status `Concluído`. Depois, 1 submissão via upload de arquivo direto (qualquer modo) — confirmar que o arquivo chega à pasta de fila correta sem passar por `yt-dlp`.
6. Rollback: reverter o(s) node(s) de roteamento do workflow de ingestão para não reconhecer `PODCAST`/upload de arquivo (comportamento anterior) caso o novo pipeline apresente problema — "Blocos" e "Palavra Completa" nunca são tocados, então esses dois modos nunca ficam em risco.

## Open Questions

- Intervalo exato do Schedule Trigger do workflow de Podcast (30min vs. 60min) — ajustável na implementação sem reabrir specs/design, mesmo raciocínio já registrado para Palavra Completa.
- Nome exato do badge/rótulo "Podcast" na UI da aba Vídeos — detalhe de copy, não muda comportamento normativo do spec.
- Calibração fina dos critérios de "destaque de podcast" nos prompts de IA (pesos exatos por critério) — só pode ser validada com episódios reais, mesmo processo iterativo já usado para calibrar os prompts de "Blocos" ao longo do projeto.
