# Switch

Interruptor liga/desliga de 36×20px, usado em "Modo Palavra Completa" (Enviar Vídeo) e "Remover silêncios (Jump Cut)" (diálogo de corte).

`<button class="switch" role="switch" aria-checked>` com um `<span class="knob">` dentro. Desligado: trilho `border-control` (3:1+), knob à esquerda. Ligado: trilho `accent`, knob a 18px. O knob é `knob` com `shadow-sm` e desliza em 150ms. A linha é um `.setting-row`: `.setting-title` (13px/500) e, se houver, `.setting-hint` (12px, `text-muted`) à esquerda; o switch à direita.

Só aparece quando a opção tem efeito: Palavra Completa some se o tipo não for Pregação. O consumidor fornece o estado e um `aria-label`.
