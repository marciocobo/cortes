# VideoCard

Card de um clipe na biblioteca: miniatura, badges de tipo, nome, meta, status e ações.

`.card.video-card` dentro de uma `.video-grid` (3/2/1 colunas, gap 16px). No hover a borda sobe para `surface-active`. Ordem fixa:
1. `.thumb-wrap` 16:9 com gradiente `thumb-from`→`thumb-to` e fio `border` embaixo; `<img class="thumb">` com `object-fit: contain` (Shorts são 9:16), ou `.play-icon` sem imagem; `.duration-badge` (`duration-bg`, `on-media`, tabular) no canto inferior direito.
2. `.body` (padding 16px): `.badges` com TypeBadge(s), `.name` (o hook do clipe, `clip-name`, até 2 linhas), `.meta` (`small`, `text-muted`: tamanho · data e "Por <nome>"), `.clip-status-row` com ClipStatus e a data do corte, e `.actions` separadas por um fio `border`, com IconButtons Baixar, Cortar, Excluir (dim).

O consumidor fornece o clipe (thumbnail, duração, tipo, flags de formato, hook ou nome, tamanho, datas, autor, status) e os handlers. Durante o carregamento, mostre o Skeleton com o mesmo layout.
