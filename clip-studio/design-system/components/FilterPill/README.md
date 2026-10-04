# FilterPill

Linha de filtros da biblioteca de vídeos: um rótulo à esquerda (Tipo, Categoria) e pílulas que ligam e desligam.

`.filter-row` contém `.filter-row-label` (12px, `text-dim`, largura mínima de 68px) e uma `.filter-pill` por opção. Ativa: `.filter-pill-active` (fundo `text-bright`, texto `ink`, sem borda). Clicar de novo na pílula ativa limpa o filtro. Uma linha que depende de outra (Categoria depende de Tipo) fica `disabled`, com opacidade 0,4 e `title="Selecione um tipo primeiro"`.

Extraído dos estilos inline de `VideoLibrary.tsx`. O consumidor fornece as opções, o valor ativo (ou nenhum) e se a linha está liberada.
