# ClipStatus

Pílula em contorno com o estado de um clipe na biblioteca: Original, Rascunho, Cortado, Processando.

`.clip-status-pill` (0,7rem, borda `border`, `radius-pill`) mais `.clip-status-original` (`text-dim`), `.clip-status-rascunho` (`status-processando`), `.clip-status-cortado` (`status-concluido`) ou `.clip-status-processando` (`status-baixando`). Fica numa `.clip-status-row` junto da data do último corte (`.clip-status-date`, só para Cortado).

Contorno, e não preenchimento, para não competir com os badges de tipo do mesmo card. Rascunho existe só no navegador (localStorage) e é filtrado como Original. O consumidor fornece o status e a data.
