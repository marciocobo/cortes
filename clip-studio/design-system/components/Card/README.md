# Card

Superfície elevada que agrupa um formulário, uma lista ou um clipe.

`.card`: fundo `surface`, borda `border` (fio de cabelo), `radius-lg` (12px) e `shadow-sm`. Variantes de layout: `.form-card` (padding 24px, largura máxima `form-max`, 32px abaixo), `.card-pad` (padding 16px), `.table-card` (sem padding, `overflow:hidden` para a tabela respeitar os cantos), e nenhum padding no card de vídeo (o corpo tem o próprio). Títulos dentro do card usam `h2.card-title` (`title-section`).

Confirmações de sucesso não pintam a borda do card: use `.callout-success` (fundo tonal `status-concluido-soft`, `radius-md`). Não empilhe cards dentro de cards e não troque a borda por sombra. O consumidor fornece o conteúdo.
