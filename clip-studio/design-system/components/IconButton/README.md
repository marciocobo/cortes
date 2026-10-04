# IconButton

Botão quadrado de 32px (`control-sm`) só com ícone, cantos `radius-md`. Usado nas ações do card de vídeo (Baixar, Cortar, Excluir), no rodapé do diálogo de corte, nos ajustes ±0,1s e no Reprocessar do histórico.

`.icon-btn` com um SVG de 16px dentro: contorno `border`, ícone `text-muted`; hover `surface-hover` com contorno `border-control` e ícone `text`. Dentro de `.video-card` o ícone fica em `text`; acrescente `.icon-btn-dim` para a ação menos importante (Excluir), que fica em `text-muted` e nunca em vermelho. `.icon-btn-solid` é a confirmação (Salvar corte): fundo `primary`, ícone `on-primary`. `.icon-btn-text` serve para um glifo de texto (− e +). Foco: `focus-ring`. Desabilitado: opacidade 0,4.

O consumidor fornece o ícone (de `assets/Icons/`), `title` e `aria-label` em português. Pode ser `<a>` quando a ação é um download.
