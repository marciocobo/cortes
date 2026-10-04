# TrimTrack

Trilha de corte do diálogo Cortar vídeo: uma barra única com o trecho selecionado em azul, duas alças arrastáveis e a agulha de reprodução.

`.trim-times` mostra "atual / duração" à esquerda e "Selecionado: …" à direita (12px, `text-muted`, tabular, formato m:ss.d). Abaixo, `.trim-track` (8px, `surface-active`, `radius-xs`) com `.trim-range` (`accent`) posicionada por `left`/`width` em %, `.trim-playhead` (2×16px, `text`) e duas `.trim-handle` (16px, `accent` com aro de 2px `knob` e `shadow-sm`, `role="slider"`, foco `focus-ring`). Embaixo, `.trim-steppers` com dois `.stepper`: Início e Fim, cada um entre botões −/+ (`.icon-btn.icon-btn-text`).

Passo de 0,1s para arrasto, teclado e botões ±; Shift+seta anda 1s. As alças usam pointer capture e `touch-action: none`. O consumidor fornece duração, início, fim, posição atual e os handlers.
