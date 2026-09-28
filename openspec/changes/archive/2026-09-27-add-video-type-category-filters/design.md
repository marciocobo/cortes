## Context

Hoje o `VideoLibrary.tsx` só filtra por status (`STATUS_FILTERS`, com default `Original`) e mostra dois pills de formato independentes (`isFullWord` → "Palavra Completa", `isPodcast` → "Podcast") em cada card. O `n8n-client.ts`'s `listClips()` deriva os dois booleans a partir da tag `sourceFolder` do item do Graph, que o webhook `clip-studio/clips` do n8n já anexa por item (`"Cortes"` / `"PalavraCompleta/Cortes"` / `"Podcast/Cortes"`). `Submission.mode` (`SHORTS` / `PALAVRA_COMPLETA` / `PODCAST`) decide para qual pipeline/pasta um novo envio é roteado; `SubmissionHistory.tsx`'s `CONTENT_TYPE_LABEL` já colapsa `SHORTS`/`PALAVRA_COMPLETA` num único rótulo "Pregação", batendo com o seletor de tipo de conteúdo de dois valores (`PREGACAO`/`PODCAST`) que o formulário "Enviar Vídeo" já usa hoje. Ver proposal.md para o motivo desta change e o que fica fora de escopo (nenhum pipeline de Louvor, nenhuma pasta criada no OneDrive).

O mockup revisado modela o card da biblioteca com um único campo `contentType` (`pregacao`/`louvor`/`podcast`) e um único badge derivado dele — não tem nenhuma noção da distinção de formato Palavra Completa/Shorts, porque os dados de demonstração do mockup não precisam disso. O app real ainda precisa.

## Goals / Non-Goals

**Goals:**
- Introduzir um filtro `Tipo` (tipo de conteúdo) na biblioteca, bloqueando o filtro de status já existente (relabelado `Categoria`) atrás dele, batendo exatamente com a interação do mockup.
- Dar a cada clipe uma classificação `contentType` de primeira classe (`PREGACAO`/`LOUVOR`/`PODCAST`), derivada da mesma forma que `isFullWord`/`isPodcast` já são hoje, para que `LOUVOR` seja um valor de filtro real (ainda que sempre vazio por ora), e não só um stub de UI.
- Reservar `SubmissionMode.LOUVOR` e a convenção de pasta `Videos-Cortes/Louvor/Cortes` a nível de modelo/nomenclatura, para que uma change futura de construção do pipeline se encaixe sem outra migração nem uma discussão de convenção de `sourceFolder`.

**Non-Goals:**
- Construir o workflow n8n de Louvor, a pasta `Videos-Cortes/Louvor` no OneDrive, ou qualquer UI do lado de envio para ele (ver proposal.md, "Impact - Fora do escopo").
- Mudar como Shorts vs. Palavra Completa são escolhidos no momento do envio, ou os valores de `Submission.mode` que o `SubmitForm.tsx` oferece.
- Reformular os próprios três valores do filtro de status (`Original`/`Cortado`/`Processando`) — só seu rótulo e seu bloqueio atrás do Tipo mudam.

## Decisions

### `contentType` é um campo derivado, não um dado novo persistido
Assim como `isFullWord`/`isPodcast` hoje, `contentType` é calculado dentro de `listClips()` em `n8n-client.ts` a partir da mesma tag `sourceFolder` já retornada pelo webhook `clip-studio/clips` existente — nenhuma mudança de n8n ou de webhook é necessária. Mapeamento: `sourceFolder` igual a `"Cortes"` ou `"PalavraCompleta/Cortes"` → `PREGACAO`; `"Podcast/Cortes"` → `PODCAST`; um novo valor `"Louvor/Cortes"` (nunca de fato retornado hoje, já que nada grava lá) → `LOUVOR`. `isFullWord` continua como seu próprio boolean (ainda necessário para o badge de formato — ver abaixo) em vez de ser incorporado a `contentType`, já que Palavra Completa é uma variante de formato de Pregação, não um tipo de conteúdo irmão.

**Alternativa considerada**: armazenar `contentType` como uma coluna real (ex: numa nova tabela `Clip`). Rejeitada — clipes não são modelados no Postgres hoje (vivem no OneDrive, lidos ao vivo via webhook); introduzir uma tabela `Clip` só para guardar um valor já totalmente derivável da tag de pasta existente seria superfície de schema sem nenhuma capacidade nova, e precisaria de sua própria história de backfill/sincronização, que a abordagem de campo derivado evita completamente.

### Manter o badge de Palavra Completa junto do novo badge de tipo de conteúdo
O mockup mostra um único badge por card (só o badge de tipo de conteúdo). O app real ainda precisa distinguir um clipe de Shorts de um clipe de Palavra Completa — os dois se classificam como `Pregação` sob o novo filtro Tipo, mas são renderizados e consumidos de formas diferentes (9:16 com muitos clipes vs. proporção original com um único clipe) e um Clipador informado dessa distinção em sessões anteriores depende dela. Decisão: renderizar o novo badge de tipo de conteúdo (colorido conforme o mockup: `#8fa8f7` Pregação, `#7ed3a8` Louvor, `#e9a468` Podcast) na posição que o mockup mostra, e manter o pill "Palavra Completa" já existente logo depois dele, só para clipes com `isFullWord`. Esta é uma divergência deliberada do markup exato do card no mockup, justificada porque os dados fictícios do próprio mockup nunca modelaram Palavra Completa.

**Alternativa considerada**: remover o badge de Palavra Completa, batendo literalmente com o mockup. Rejeitada — isso removeria um sinal real (formato, não só conteúdo) que o Clipador usa hoje para distinguir um clipe de Palavra Completa de um Short à primeira vista, e que não é endereçado em nenhum outro lugar do mockup nem pelo novo filtro Tipo (ambos são `Pregação`).

### `SubmissionMode.LOUVOR` adicionado agora, sem uso
Adicionar o valor de enum é uma única migração Prisma aditiva (`ALTER TYPE "SubmissionMode" ADD VALUE 'LOUVOR'`), sem nenhum caminho de leitura/escrita exercitando-o ainda. Esta é a forma concreta de "deixar implementando" do pedido do usuário: o schema fica pronto para uma change futura rotear um envio de Louvor sem precisar mexer em migrações de novo. `CONTENT_TYPE_LABEL` em `SubmissionHistory.tsx` ganha uma entrada `LOUVOR: "Louvor"` por completude de tipos (o `Record<Submission["mode"], string>` do TypeScript deixaria de compilar sem isso assim que o enum crescer) — inalcançável na prática, já que nenhum envio pode ser criado com esse modo.

**Alternativa considerada**: deixar `SubmissionMode` intocado até que a change do pipeline de Louvor realmente precise dele. Rejeitada conforme a escolha explícita do usuário (ver pergunta de esclarecimento na sessão de propose) — ele pediu que o enum fizesse parte do scaffolding desta change, não que fosse adiado.

### Carga sob demanda por Tipo, com cache em memória
Pedido do usuário depois do primeiro deploy: a aba Vídeos não deve buscar nada ao abrir — só ao clicar num Tipo, e só os clipes daquele Tipo; depois de carregado, voltar ao mesmo Tipo não busca de novo ("igual era antes", quando a lista era carregada uma vez só). Implementação:
- `GET /api/clips?type=PREGACAO|LOUVOR|PODCAST` passa o tipo para `listClips(type)`, que descarta os clipes dos outros tipos **antes** do N+1 de `_meta.json` (o custo dominante da listagem) — abrir um Tipo só paga pelos clipes dele. Tipo inválido → 400; sem `type` → todos os tipos (comportamento antigo da rota).
- `VideoLibrary.tsx` mantém `clipsByType` (um mapa `Tipo → clipes`) e um `typeRef` espelhando o Tipo atual (evita closure obsoleta em `load()`, chamado de callbacks assíncronos e listeners de janela). Selecionar um Tipo só chama `load(tipo)` se não houver entrada no cache ou se a última busca dele falhou (`failedTypesRef`) — assim um erro não deixa uma lista vazia em cache para sempre.
- Uma resposta que chega depois de o usuário ter trocado de Tipo ainda é guardada no Tipo certo (volta instantânea depois), mas não altera o que está na tela.
- Atualização por foco da aba (no máximo a cada 2 min, como já era), renomear, excluir e cortar recarregam **só o Tipo selecionado**, e o foco não faz nada sem Tipo selecionado.

**Alternativa considerada**: carregar tudo uma vez e filtrar no cliente (o comportamento antes desta change). Rejeitada — o usuário pediu explicitamente carga por Tipo, e a listagem completa paga o N+1 de metadados de todos os tipos mesmo quando só um interessa.

### Tipo/Categoria começam sem seleção, batendo exatamente com o mockup
Hoje a biblioteca inicia `statusFilter` como `"Original"` por default e mostra clipes imediatamente. O mockup inicia tanto `typeFilter` quanto `statusFilter` como `null` e mostra um aviso "Selecione um tipo para ver os vídeos." até que um tipo seja escolhido; escolher um tipo sem Categoria selecionada mostra todos os status daquele tipo (não só `Original`). Esta é uma mudança real de comportamento de UX (marcada **BREAKING** na proposal) mas é implementada exatamente como o mockup demonstra, em vez de amenizada com um default "inteligente", já que o mockup é o artefato que o usuário pediu para ser avaliado e trazido para o app.

## Risks / Trade-offs

- **[Risco] O clique extra obrigatório (selecionar Tipo antes de ver qualquer coisa) adiciona fricção para o caso comum de "só me mostra os clipes recentes".** → Aceito como está, conforme o mockup ser a referência explícita; se isso se mostrar incômodo na prática, uma change futura pode adicionar um default de "último tipo lembrado" (ex: via `localStorage`, mesmo padrão já usado para rascunhos de corte) sem precisar mudar a spec do comportamento de filtro em si.
- **[Risco] A pill de filtro `LOUVOR` sempre vai mostrar "Nenhum vídeo encontrado" até que um pipeline futuro exista, o que pode parecer quebrado em vez de "ainda não construído".** → Mitigado pelo cenário explícito da spec "No clip classifies as Louvor yet" (mesma mensagem de estado vazio usada para qualquer tipo com zero resultados, não um erro tratado à parte) — aceitável já que a proposal é explícita sobre o pipeline estar fora de escopo.
- **[Risco] Divergir do card de badge único do mockup (mantendo Palavra Completa junto) pode parecer inconsistente se o mockup for usado como referência pixel-a-pixel depois.** → Documentado explicitamente acima como um desvio deliberado e justificado, não uma omissão.

## Migration Plan

1. Migração Prisma: adicionar `LOUVOR` a `SubmissionMode` (aditiva, sem backfill de dados, segura para fazer deploy antes de qualquer mudança de UI).
2. Entregar a derivação de `contentType` em `n8n-client.ts` e a nova UI de Tipo/Categoria em `VideoLibrary.tsx` juntas (a UI depende do campo existir em `ClipSummary`).
3. Nenhuma mudança do lado do n8n, nenhuma criação de pasta no OneDrive — nada para coordenar com a instância n8n de produção nesta change.
4. Rollback: reverter o deploy do app; o valor de enum aditivo é inofensivo de deixar no lugar mesmo que a mudança de UI seja revertida (nenhum código vai ler `LOUVOR` de `ClipSummary.contentType`, já que nenhum clipe jamais terá esse valor).

## Open Questions

Estas foram encontradas na validação completa do mockup (linha a linha, incluindo a lógica de estado do componente, não só o markup) mas propositalmente **não** viram decisão de design nem tarefa de implementação nesta change — ver "Achados adicionais" em proposal.md para o detalhe completo de cada uma. Ficam registradas aqui porque, ao contrário de uma pergunta adiável comum, resolvê-las MUDARIA specs, tasks e possivelmente o próprio `rbac.ts`/`Sidebar.tsx` — por isso pedem uma decisão explícita do usuário antes de qualquer implementação, em vez de uma suposição:

1. A biblioteca de vídeos deveria escopar por dono para papéis não-Admin (como `auth-rbac/spec.md` já parece exigir, mas o código não implementa)? Se sim, como tratar os clipes cujo `submittedByName` é `null` (vídeo original não veio de uma submissão do Clip Studio) — ficam visíveis a todos, ou ocultos de todos os não-Admin?
2. O papel Clipador deveria ter acesso à aba "Enviar Vídeo" / capability `youtubeIngestion` (como `auth-rbac/spec.md` também parece exigir, mas `rbac.ts` e `Sidebar.tsx` hoje restringem a Uploader/Admin)?

Se a resposta a qualquer uma delas for "sim, implementar", o caminho mais seguro é uma change própria (com sua própria spec delta em `auth-rbac` e/ou `video-library`), não um adendo a esta.
