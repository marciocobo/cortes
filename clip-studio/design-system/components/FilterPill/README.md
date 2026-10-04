# FilterPill

Linhas de filtro da biblioteca de vídeos: um rótulo à esquerda (Tipo, Categoria) e chips que ligam e desligam.

Um `.filters` agrupa as linhas e dá 24px até a grade. Cada `.filter-row` contém `.filter-row-label` (12px/500, `text-muted`, largura mínima de 72px) e um `.filter-pill` por opção: chip de 28px (`chip-height`), `radius-pill` (o único controle que continua pílula), contorno `border-control`, texto `text-muted`. Ativo: `.filter-pill-active` com fundo `accent-soft`, texto e contorno `accent`, e `aria-pressed="true"`. Clicar de novo no chip ativo limpa o filtro. Uma linha que depende de outra (Categoria depende de Tipo) fica `disabled`, com opacidade 0,4 e `title="Selecione um tipo primeiro"`.

O consumidor fornece as opções, o valor ativo (ou nenhum) e se a linha está liberada.
