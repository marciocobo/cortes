## Context

Ver proposal.md - Why para a motivação. Estado atual relevante (ver `openspec/changes/archive/2026-08-28-add-clip-studio-app/design.md` para o desenho original):

- O envio de vídeo no Clip Studio (`SubmitForm.tsx` → `POST /api/submissions`) cria um `Submission` (`FILA`), e um dispatcher sequencial (`dispatcher.ts`) chama `triggerIngestion()` (`n8n-client.ts`) para no máximo 1 download por vez.
- `triggerIngestion` chama o webhook `clip-studio/ingest` de um **workflow n8n de ingestão separado de "Blocos"**: baixa via `yt-dlp` (binário estático, sem Python), sobe o arquivo para `Videos-Cortes` (raiz) via OneDrive, e dispara "Blocos" (`execute_workflow`, fire-and-forget) — sem tocar nos nodes de "Blocos".
- "Blocos" (`ID4wisnN4Tqpt2zh`) roda inteiramente na mesma VPS Alpine hardened (6 vCPUs), com whisper.cpp `large-v3-turbo -t 6`, trava de execução por arquivo (`/home/node/.n8n-files/.processing.lock`, expiração 8h) e fila própria com self-chaining + Schedule Trigger a cada 6h.
- A aba Vídeos (`VideoLibrary.tsx`) lista clipes via o webhook `clip-studio/clips`, que só enumera `Videos-Cortes/Cortes`.
- Um poller (`isOriginalArchived` em `n8n-client.ts`) confirma `Concluído` checando se o vídeo original apareceu em `Videos-Cortes/Videos` (onde "Blocos" arquiva o original após processar).

## Goals / Non-Goals

**Goals:**
- Toggle no formulário de envio existente (`SubmitForm.tsx`), não uma tela nova — usuário já confirmou que deve ficar na aba Enviar Vídeo.
- Roteamento por `mode` acontece só no workflow de ingestão (já isolado de "Blocos" por design anterior) — "Blocos" continua 100% intocado.
- Novo workflow "Palavra Completa" construído "nos mesmos moldes" do que já existe (trava de arquivo, fila+self-chaining, Schedule Trigger, filtro de fase, `retryOnFail`/`onError`) — reaproveitando padrões já validados em produção, não inventando um mecanismo novo.
- Nunca rodar whisper.cpp de "Blocos" e de "Palavra Completa" ao mesmo tempo na mesma VPS de 6 vCPUs.
- Resultado visível na aba Vídeos, junto dos Shorts, com badge.

**Non-Goals:**
- Separação de voz/música real (Demucs/Spleeter) — decisão explícita do usuário, dado que a VPS é Alpine hardened sem Python.
- Crop 9:16 no clipe único — decisão explícita do usuário (mantém paisagem original).
- Callback dedicado de "Palavra Completa" para o Clip Studio (equivalente ao callback de ingestão) — reaproveita o mesmo padrão de poller já usado para `Concluído`, só apontando para a pasta de arquivamento correta conforme o `mode`.
- Mudar qualquer node, prompt, threshold ou comportamento do workflow "Blocos" em produção.

## Decisions

### 1. `Submission.mode` como campo persistido, não um parâmetro só-de-request
Alternativa descartada: não persistir o modo, só repassar no payload do webhook de ingestão. Rejeitada porque o poller de status (`isOriginalArchived`) e a listagem de clipes (join por `videoSource`/`uploadedFileName`) precisam saber, depois do fato, qual pasta de arquivamento checar para aquela submissão — sem persistir o modo, o poller não saberia se deve olhar `Videos-Cortes/Videos` ou `Videos-Cortes/PalavraCompleta/Videos`.

### 2. Ramificação por `mode` só no workflow de ingestão, nunca em "Blocos"
O workflow de ingestão (já existente, separado de "Blocos" desde a change `add-clip-studio-app`) recebe `{submissionId, youtubeUrl, title, mode}` no webhook `clip-studio/ingest`. Um node IF logo após o upload do `yt-dlp` decide o destino:
- `mode=SHORTS` (comportamento atual, inalterado): upload em `Videos-Cortes` (raiz) → `execute_workflow` para "Blocos" (`ID4wisnN4Tqpt2zh`).
- `mode=PALAVRA_COMPLETA` (novo): upload em `Videos-Cortes/PalavraCompleta` → `execute_workflow` para o novo workflow "Palavra Completa".

Alternativa descartada: fazer "Blocos" também aceitar um parâmetro de modo e ramificar internamente. Rejeitada — o usuário foi explícito que isso "não deve impactar o que já tem hoje", e o workflow de ingestão já é o ponto de integração desenhado justamente para não tocar em "Blocos".

### 3. Trava de execução COMPARTILHADA entre "Blocos" e "Palavra Completa"
Ambos os workflows checam/adquirem o **mesmo** arquivo de lock (`/home/node/.n8n-files/.processing.lock`), não locks separados por workflow. Isso é crítico: a VPS tem 6 vCPUs e o histórico do projeto já documentou (13/07/2026, ver CLAUDE.md) que 2 processos `whisper.cpp large-v3 -t 6` simultâneos travam a VPS por 17h+ sem completar nem o primeiro node. Como "Palavra Completa" também roda whisper.cpp (para ter a transcrição/pontos de conclusão), ele precisa competir pelo mesmo lock, não ter um lock próprio que permitiria as duas transcrições rodarem em paralelo.

Consequência: "Palavra Completa" reusa o node "Aplicar Trava"/"Trava Liberada?" (padrão soft-fail já corrigido em 29/07/2026 — lock ocupado termina com sucesso, não erro) e precisa de um Schedule Trigger próprio (ex.: a cada 30-60min, mais frequente que os 6h de "Blocos" porque o caso de uso é 1 clipe por vídeo, mais rápido de processar) para reprocessar depois que o lock liberar, já que não há garantia de que o disparo original (via `execute_workflow` da ingestão) vá encontrar o lock livre na hora.

Alternativa descartada: lock próprio por workflow. Rejeitada — reproduziria exatamente o bug já documentado e corrigido no passado, só que entre dois workflows diferentes em vez de duas execuções do mesmo workflow.

### 4. "Palavra Completa" replica a estrutura de "Blocos" até a transcrição, diverge depois
Reaproveita (copiado, não referenciado — são workflows n8n separados) os nodes já validados: Verificar/Aplicar Trava, download via wget streaming, FFprobe + Extrair Áudio (com calibração de `noiseThreshold`), Whisper.cpp Transcrever (`large-v3-turbo -t 6`), "Mesclar Pausas Curtas". Diverge a partir daí:
- Uma chamada de IA (`GPT — Limites da Palavra`) recebe a transcrição completa e devolve `{sermonStart, sermonEnd, reason}` — reaproveitando o texto da regra de exclusão de 5 fases já validado em "Blocos", adaptado para pedir só os 2 timestamps extremos em vez de um ranking de blocos.
- "Montar Clipe Único" (Code): 1 clipe, sem teto de 180s, valida só uma duração mínima de sanidade.
- "FFmpeg Cortar Palavra Completa": reaproveita o snap de silêncio simétrico (`ASTART`/`AEND`, threshold dinâmico) de "Blocos", mas sem o `-vf crop=...` (mantém paisagem) e com o filtro de áudio `-af "highpass=f=200,lowpass=f=3000"` adicional.
- Fila própria (`Videos-Cortes/PalavraCompleta` → "Selecionar Vídeo" equivalente) + self-chaining + Schedule Trigger, mesmo padrão de "Blocos".
- Upload do clipe único + `_meta.json` em `Videos-Cortes/PalavraCompleta/Cortes`; arquivamento do original em `Videos-Cortes/PalavraCompleta/Videos`.

Alternativa descartada: passar o arquivo local já baixado pelo `yt-dlp` diretamente via `execute_workflow` para "Palavra Completa", pulando o wget/OneDrive round-trip. Rejeitada — quebraria o padrão "mesmos moldes", perderia a garantia de que o arquivo já está no OneDrive como fonte de verdade (útil se a execução falhar e precisar reprocessar), e complicaria a trava (que hoje já assume "todo processamento começa por um arquivo no OneDrive").

### 5. Webhook `clip-studio/clips` estendido para listar as duas pastas
O Code node desse webhook n8n passa a fazer 2 consultas Graph API (`Videos-Cortes/Cortes` e `Videos-Cortes/PalavraCompleta/Cortes`) e concatenar o resultado, incluindo um campo por item (ex. `sourceFolder`) que `n8n-client.ts`/`listClips()` usa para derivar `mode`/badge em `ClipSummary`. Alternativa descartada: um segundo webhook dedicado (`clip-studio/clips/palavra-completa`) chamado à parte pelo Clip Studio. Rejeitada por simplicidade — a aba Vídeos já faz 1 carregamento único hoje; manter isso evita 2 round-trips e 2 pontos de falha na tela.

### 6. Poller de arquivamento (`isOriginalArchived`) passa a receber o `mode`
O webhook `clip-studio/videos/check-archived` ganha um parâmetro `mode` e checa `Videos-Cortes/Videos` (Shorts) ou `Videos-Cortes/PalavraCompleta/Videos` (Palavra Completa) conforme o valor. O poller do Clip Studio já sabe o `mode` de cada `Submission` (persistido, decisão 1), então passa esse valor adiante sem precisar adivinhar.

## Risks / Trade-offs

- **[Risco] Filtro highpass/lowpass pode degradar a inteligibilidade da voz em gravações com muito ruído de fundo** → Mitigação: opt-in por submissão (só quando o usuário escolhe o modo), e o spec já deixa explícito que a atenuação é best-effort.
- **[Risco] Dois workflows disputando o mesmo lock pode deixar "Palavra Completa" esperando bastante tempo se "Blocos" tiver uma fila longa** → Mitigação: aceito conscientemente — é preferível a rodar simultaneamente e travar a VPS; o Schedule Trigger próprio garante que eventualmente roda sem intervenção manual.
- **[Risco] Divergência futura entre "Blocos" e "Palavra Completa"** (nodes copiados, não compartilhados) **pode fazer um fix aplicado em um não se propagar pro outro** → Mitigação aceita conscientemente: é o mesmo trade-off já aceito pelo projeto entre HTML/`workflow-blocos.json`/produção (3 lugares mantidos manualmente em sincronia) — documentar claramente no CLAUDE.md quais fixes de "Blocos" (ex. threshold dinâmico de silêncio, regex do nome do pregador) também deveriam ser replicados manualmente em "Palavra Completa" quando/se acontecerem.
- **[Trade-off] Sem crop 9:16, o clipe único não é diretamente postável como Short** → aceito conscientemente pelo usuário.
- **[Trade-off] Sem separação de voz real, música de fundo alta o suficiente pode continuar audível** → aceito conscientemente pelo usuário.

## Migration Plan

1. Prisma migration: `SubmissionMode` enum + `Submission.mode` (default `SHORTS`) — não destrutivo, todas as submissões existentes ficam `SHORTS`.
2. Publicar o novo workflow "Palavra Completa" no n8n (separado, não afeta "Blocos" nem o workflow de ingestão até o passo 3).
3. Atualizar o workflow de ingestão (ramificação por `mode` + upload condicional) e o webhook `clip-studio/clips`/`clip-studio/videos/check-archived` (extensão), publicar.
4. Deploy do Clip Studio com o toggle, `mode` no payload, e badge na aba Vídeos.
5. Smoke test: 1 submissão em modo Palavra Completa contra um vídeo curto de teste — confirmar fila, download, trava compartilhada, clipe único sem crop, badge na aba Vídeos, status `Concluído`.
6. Rollback: reverter o node IF do workflow de ingestão para sempre ir por `Videos-Cortes` (comportamento anterior) caso o novo workflow apresente problema — "Blocos" nunca foi tocado, então o modo Shorts nunca fica em risco.

## Open Questions

- Nome exato do badge/rótulo na UI da aba Vídeos ("Palavra Completa" vs. algo mais curto) — detalhe de copy, não muda comportamento normativo do spec.
- Intervalo exato do Schedule Trigger do novo workflow (30min vs. 60min) — ajustável na implementação sem reabrir specs/design, desde que garanta reprocessamento eventual sem intervenção manual.
- Frequência/estratégia de reconciliação entre "Blocos" e "Palavra Completa" nos 3 lugares de código (n8n produção, HTML gerador, JSON estático) — fica para uma decisão operacional do usuário fora desta change, já que o HTML gerador (`n8n-video-silence-cutter.html`) não foi tocado por esta change (o novo workflow foi construído diretamente como um workflow n8n, não através do gerador HTML).
