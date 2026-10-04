# IconButton

Botão circular de 32px só com ícone, usado nas ações do card de vídeo (Baixar, Cortar, Excluir) e no rodapé do diálogo de corte.

`.icon-btn` com um SVG de 16px dentro. Dentro de `.video-card` o ícone fica em `text-bright`; acrescente `.icon-btn-dim` para a ação menos importante (Excluir), que fica em `text-dim` e nunca em vermelho. Hover: borda `accent-blue`. Foco de teclado: `focus-ring`. Desabilitado: opacidade 0,4.

O consumidor fornece o ícone (de `assets/Icons/`), `title` e `aria-label` em português. Pode ser `<a>` quando a ação é um download.
