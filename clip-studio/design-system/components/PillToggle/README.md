# PillToggle

Grupo de opções exclusivas em pílula, usado no formulário Enviar Vídeo (Link do YouTube / Enviar arquivo; Pregação / Podcast / Louvor).

`.pill-toggle` para cada opção e `.pill-toggle-active` na escolhida. Inativa: texto `accent-blue` sobre transparente com borda `border`. Ativa: `accent` com texto `accent-fg`, peso 600. Gap de 8px entre as opções; quando as opções dividem a largura, cada uma recebe `flex:1`.

O consumidor fornece as opções e o valor atual, com `role="radio"` e `aria-checked` em cada botão. Para filtrar listas, use FilterPill, não este componente.
