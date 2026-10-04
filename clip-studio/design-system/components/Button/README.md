# Button

Botões de texto do Clip Studio, em cinco variantes com papéis fixos.

- `.btn-primary`: a ação principal da tela (Enviar, Entrar). Branco (`accent`) em pílula, peso 600. Ocupa 100% da largura por padrão; em formulários o app usa `width:auto; padding:12px 24px`. Um por tela.
- `.btn-light`: confirmação dentro de diálogo (Salvar). `text-bright` com texto `ink`, 13px/500.
- `.btn-ghost`: Cancelar em diálogos. Sem borda, `text-dim`.
- `.btn-secondary`: ações secundárias em listas do admin. Contorno `border`, cantos `radius-sm`.
- `.btn-danger`: só o botão que confirma uma exclusão. Contorno e texto `danger`, cantos `radius-sm`.

O consumidor fornece o rótulo (um verbo) e o estado `disabled`; enquanto a ação roda, troque o rótulo para o gerúndio ("Enviando..."). Desabilitado = opacidade 0,6. Nunca use vermelho fora da confirmação final.
