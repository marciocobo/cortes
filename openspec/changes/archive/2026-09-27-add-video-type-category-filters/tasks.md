## 1. Schema

- [x] 1.1 Adicionar `LOUVOR` ao enum `SubmissionMode` em `prisma/schema.prisma`, com um comentário indicando que é reservado (nenhum pipeline/caminho de envio o usa ainda — ver design.md).
- [x] 1.2 Gerar e aplicar a migração Prisma do novo valor de enum.

## 2. Classificação de tipo de conteúdo (`n8n-client.ts`)

- [x] 2.1 Adicionar um campo `contentType: "PREGACAO" | "LOUVOR" | "PODCAST"` a `ClipSummary`.
- [x] 2.2 Derivar `contentType` em `listClips()` a partir de `sourceFolder`: `"Cortes"` e `"PalavraCompleta/Cortes"` → `PREGACAO`, `"Podcast/Cortes"` → `PODCAST`, `"Louvor/Cortes"` → `LOUVOR` (inalcançável hoje, nenhum pipeline grava lá — documentar com um comentário referenciando esta change).
- [x] 2.3 Manter `isFullWord`/`isPodcast` como estão (ainda necessários para o badge de formato Palavra Completa — ver design.md); não remover nem incorporar a `contentType`.

## 3. Filtros da biblioteca de vídeos (`VideoLibrary.tsx`)

- [x] 3.1 Adicionar estado `typeFilter` (`"PREGACAO" | "LOUVOR" | "PODCAST" | null`, default `null`), substituindo o comportamento atual de `statusFilter` default `"Original"` por `statusFilter` também default `null`.
- [x] 3.2 Renderizar a linha de filtro "Tipo" (pills: Pregação/Louvor/Podcast) acima da linha de status já existente; selecionar uma pill define `typeFilter`; clicar na pill já ativa de novo limpa tanto `typeFilter` quanto `statusFilter`.
- [x] 3.3 Relabelar o cabeçalho da linha de filtro de status para "Categoria"; desabilitar suas pills (esmaecidas + `cursor: not-allowed` + tooltip "Selecione um tipo primeiro") sempre que `typeFilter` for `null`.
- [x] 3.4 Atualizar a lógica de filtragem: nenhum clipe é renderizado até que `typeFilter` esteja definido; uma vez definido, mostrar clipes com `contentType === typeFilter`, restringidos ainda mais por `statusFilter` quando também definido (sem restrição adicional quando `statusFilter` for `null`).
- [x] 3.5 Adicionar o estado vazio "Selecione um tipo para ver os vídeos." (mostrado quando `typeFilter` é `null`) e manter o estado vazio existente no estilo "Nenhum vídeo encontrado" para quando um tipo está selecionado mas nada corresponde (reaproveitar para o caso `LOUVOR` sempre vazio por enquanto).

## 4. Badge do card de vídeo

- [x] 4.1 Substituir a renderização ad-hoc de `isFullWord`/`isPodcast` por um único badge de tipo de conteúdo calculado a partir de `clip.contentType` (rótulo + cor: Pregação `#8fa8f7`, Louvor `#7ed3a8`, Podcast `#e9a468`, batendo com o mockup).
- [x] 4.2 Continuar renderizando o pill "Palavra Completa" já existente logo depois do novo badge, só quando `clip.isFullWord` for verdadeiro (divergência deliberada do card de badge único do mockup — ver design.md).

## 5. Completude do rótulo no histórico de envios

- [x] 5.1 Adicionar `LOUVOR: "Louvor"` a `CONTENT_TYPE_LABEL` em `SubmissionHistory.tsx` para manter o tipo `Record<Submission["mode"], string>` exaustivo depois que o enum crescer (inalcançável na prática — nenhum envio pode ter modo `LOUVOR` ainda).

## 6. Rótulo de papel no sidebar

- [x] 6.1 Adicionar um mapa `ROLE_LABEL: Record<Role, string>` (`CLIPADOR → "Clipador"`, `UPLOADER → "Uploader"`, `ADMIN → "Admin"`) em `Sidebar.tsx` e usá-lo no lugar do `{role}` cru exibido hoje no cartão de usuário do rodapé.

## 7. Validação

- [x] 7.1 `next build` e `eslint` rodam limpos.
- [x] 7.2 Verificar manualmente numa instância rodando: a biblioteca mostra o aviso "selecione um tipo" ao carregar, cada um de Pregação/Podcast mostra seus clipes reais (Louvor mostra o estado vazio), as pills de Categoria ficam desabilitadas até um tipo ser escolhido e depois filtram corretamente dentro daquele tipo, e clipes de Palavra Completa já existentes mostram os dois badges.
- [x] 7.3 Confirmar que não há regressão no formulário "Enviar Vídeo" (continua só com Pregação/Podcast) nem nas linhas já existentes de `SubmissionHistory.tsx` (continuam rotulando `SHORTS`/`PALAVRA_COMPLETA` como "Pregação", `PODCAST` como "Podcast").
- [x] 7.4 Confirmar que o sidebar mostra "Clipador"/"Uploader"/"Admin" no cartão de usuário para cada um dos três papéis.

## 7b. Carga sob demanda por Tipo (pedido pós-deploy)

- [x] 7b.1 `listClips(type?)` e `GET /api/clips?type=` filtram por Tipo antes do N+1 de `_meta.json`; tipo inválido retorna 400.
- [x] 7b.2 `VideoLibrary.tsx` não busca nada ao montar; selecionar um Tipo busca só os clipes dele.
- [x] 7b.3 Cache por Tipo em memória: reselecionar um Tipo já carregado não refaz a busca; falha é retentada ao reselecionar.
- [x] 7b.4 Foco da aba, renomear, excluir e cortar recarregam só o Tipo selecionado.
- [x] 7b.5 Verificado em produção: página abre sem buscar; Podcast carrega só clipes Podcast; Podcast → Louvor → Podcast mostra a lista na hora, sem skeleton.

## 8. Achados de RBAC fora de escopo (não implementar sem decisão explícita)

- [x] 8.1 (Decidido pelo usuário: manter o código como está e alinhar a spec — delta em `specs/clip-studio/auth-rbac/spec.md`) Levar ao usuário a divergência entre `auth-rbac/spec.md` e o código em dois pontos (ver proposal.md, "Achados adicionais"): (a) biblioteca de vídeos sem escopo por dono para Clipador, (b) Clipador sem acesso à aba "Enviar Vídeo". Não alterar `rbac.ts`, `Sidebar.tsx` (roles do link `/enviar`) nem `/api/clips` nesta change até essa decisão ser tomada.
