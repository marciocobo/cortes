# Table

Tabela para listas do admin e do histórico de envios, sempre dentro de um `.card.table-card`.

`<table>` a 100%: cabeçalho numa faixa `surface-hover` (12px/500, `text-muted`), células com padding 12px 16px, 14px, alinhadas pelo topo, separadas por `border`; a última linha não tem borda. Hover da linha: `surface-hover`. Links dentro da tabela em `accent`, quebrando em qualquer ponto. Datas usam `.cell-date` (13px, `text-muted`, tabular) e o status vai abaixo num `.cell-meta`.

Abaixo de 720px cada linha vira um bloco e cada `<td>` mostra o rótulo vindo do atributo `data-label` (110px, 12px, `text-muted`), então todo `<td>` precisa de `data-label`. O consumidor fornece colunas, linhas e os `data-label`. Status dentro da tabela usam SubmissionStatus.
