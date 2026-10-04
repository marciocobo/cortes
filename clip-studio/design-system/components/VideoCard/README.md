# VideoCard

Card de um clipe na biblioteca: miniatura, badges de tipo, nome, meta, status e ações.

`.card.video-card` dentro de uma `.video-grid` (3/2/1 colunas, gap 24px). Ordem fixa:
1. `.thumb-wrap` 16:9 com gradiente `thumb-from`→`thumb-to`; `<img class="thumb">` com `object-fit: contain` (Shorts são 9:16), ou `.play-icon` sem imagem; `.duration-badge` no canto inferior direito.
2. `.body` (padding 14px 16px): TypeBadge(s), `.name` (o hook do clipe, `clip-name`, até 2 linhas), `.meta` (tamanho · data e "Por <nome>"), `.clip-status-row` com ClipStatus e data do corte, `.actions` com IconButtons Baixar, Cortar, Excluir (dim).

O consumidor fornece o clipe (thumbnail, duração, tipo, flags de formato, hook ou nome, tamanho, datas, autor, status) e os handlers. Durante o carregamento, mostre o Skeleton com o mesmo layout.
