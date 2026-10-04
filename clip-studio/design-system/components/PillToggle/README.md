# PillToggle

Controle segmentado para opções exclusivas, usado no formulário Enviar Vídeo (Link do YouTube / Enviar arquivo; Pregação / Podcast / Louvor). O nome da classe é histórico: o controle não é mais pílula.

Um `.toggle-group` (trilho `track`, borda `border`, `radius-md`, padding 4px, gap 4px) contém um `.pill-toggle` por opção: segmento de 32px, `radius-sm`, texto `control` em `text-muted`, dividindo a largura por igual. O escolhido recebe `.pill-toggle-active`: fundo `segment-active`, borda `border`, `shadow-sm` e texto `text`.

O consumidor fornece as opções e o valor atual, com `role="radio"` e `aria-checked` em cada botão quando for uma escolha de valor. Para filtrar listas, use FilterPill, não este componente.
