# Switch

Interruptor liga/desliga de 40×22px, usado em "Modo Palavra Completa" no formulário Enviar Vídeo.

`<button class="switch" role="switch" aria-checked>` com um `<span class="knob">` dentro. Desligado: trilho `border`, knob à esquerda. Ligado: trilho `accent-blue`, knob a 20px. O knob é `text-bright` e desliza em 0,15s. O rótulo fica à esquerda (13px/500) e o switch à direita, numa linha com `justify-content: space-between`.

Só aparece quando a opção tem efeito: Palavra Completa some se o tipo não for Pregação. Extraído dos estilos inline de `SubmitForm.tsx`. O consumidor fornece o estado e um `aria-label`.
