# TrimTrack

Trilha de corte do diálogo Cortar vídeo: uma barra única com o trecho selecionado em azul, duas alças arrastáveis e a agulha de reprodução.

`.trim-times` mostra "atual / duração" à esquerda e "Selecionado: …" à direita (12px, `text-dim`, formato m:ss.d). Abaixo, `.trim-track` (8px, `border`, `radius-sm`) com `.trim-range` (`accent-blue`) posicionada por `left`/`width` em %, `.trim-playhead` (2×16px, `text-bright`) e duas `.trim-handle` (16px, `accent-blue` com aro de 2px `text-bright`, `role="slider"`, foco `focus-ring`).

Passo de 0,1s para arrasto, teclado e botões ±. As alças usam pointer capture e `touch-action: none`. O consumidor fornece duração, início, fim, posição atual e os handlers.
