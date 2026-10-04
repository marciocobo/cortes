# Modal

Diálogo centralizado sobre um scrim escuro, usado para Cortar vídeo, Renomear clipe, Excluir clipe e os detalhes de um envio.

`.modal-overlay` (fixo, `overlay`, z-index 100, padding 16px) contém um `.modal` (fundo `panel`, borda `border-strong`, `radius-xl`, padding 24px, largura 100% até um `max-width`: 420px Renomear, 440px Excluir, 520px Cortar). Dentro: `.modal-title` (`title-modal`), um texto opcional `.modal-text` e o rodapé `.modal-footer` alinhado à direita com Cancelar (`.btn-ghost`) e a confirmação (`.btn-light`, ou `.btn-danger` para excluir).

O diálogo de corte usa fundo `bg` e padding 20px, e limita a altura a `calc(100svh - 32px)` com rolagem interna (svh, não vh nem dvh, para não cortar o rodapé no mobile). Ações destrutivas sempre passam por este diálogo, nunca por uma troca inline no card. O consumidor fornece título, conteúdo, ações e o `max-width`.
