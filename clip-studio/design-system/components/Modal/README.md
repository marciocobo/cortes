# Modal

Diálogo centralizado sobre um scrim desfocado, usado para Cortar vídeo, Renomear clipe, Excluir clipe e o Histórico de tentativas.

`.modal-overlay` (fixo, `overlay` com `backdrop-filter: blur(4px)`, z-index 100, padding 16px) contém um `.modal`: fundo `surface-raised`, borda `border`, `radius-xl` (16px), `shadow-dialog`, padding 24px, largura 100% até um `max-width` passado inline (420px Renomear, 440px Excluir, 480px Histórico, 520px Cortar). Dentro: `.modal-title` (`title-modal`, 16px/600), `.modal-subtitle` ou `.modal-text` em `text-muted`, e o rodapé `.modal-footer` alinhado à direita com Cancelar (`.btn-ghost`) e a confirmação (`.btn-primary`, ou `.btn-danger` para excluir). `.modal-footer-spaced` acrescenta 24px acima.

O diálogo de corte acrescenta `.modal-cut`: padding 20px e altura limitada a `calc(100svh - 32px)` com rolagem interna (svh, não vh nem dvh, para o rodapé não sumir atrás da barra do navegador mobile nem tremer ao rolar). Seu rodapé é `.modal-cut-footer`, fixo no fim da rolagem com o mesmo fundo do diálogo. Ações destrutivas sempre passam por este diálogo, nunca por uma troca inline no card. O consumidor fornece título, conteúdo, ações e o `max-width`.
