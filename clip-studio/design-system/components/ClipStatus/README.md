# ClipStatus

Badge tonal com o estado de um clipe na biblioteca: Original, Rascunho, Cortado, Processando.

`.clip-status-pill` (12px/500, `radius-pill`, ponto à esquerda na cor do texto) mais `.clip-status-original` (tons de `status-fila`), `.clip-status-rascunho` (`status-processando`), `.clip-status-cortado` (`status-concluido`) ou `.clip-status-processando` (`status-baixando`). Cada um pinta o fundo com o `-soft` do status e o texto com a cor cheia; o texto passa de 4,5:1 nos dois temas. Fica numa `.clip-status-row` junto da data do último corte (`.clip-status-date`, números tabulares, só para Cortado).

O ponto diferencia status de tipo (os badges de tipo não têm ponto). Rascunho existe só no navegador (localStorage) e é filtrado como Original. O consumidor fornece o status e a data.
