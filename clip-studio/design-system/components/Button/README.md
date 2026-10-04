# Button

Botões de texto do Clip Studio, em cinco variantes com papéis fixos. Todos têm 36px de altura (`control-height`), cantos `radius-md`, texto `control` (14px/500) e nunca são pílula.

- `.btn-primary`: a ação principal da tela (Enviar, Entrar, Salvar, Adicionar). Fundo `primary` com texto `on-primary`: quase branco no tema escuro, quase preto no claro. Largura automática; acrescente `.btn-block` para ocupar a linha inteira (login, formulário de configuração). Um por tela ou diálogo.
- `.btn-light`: nome histórico, hoje idêntico a `.btn-primary`. Prefira `.btn-primary` em código novo.
- `.btn-secondary`: ações secundárias em listas do admin (Desativar, Reativar). Contorno `border-control`, hover `surface-hover`. Com `.btn-sm` fica com 32px.
- `.btn-ghost`: Cancelar e Fechar em diálogos. Sem contorno, `text-muted`, hover `surface-hover`.
- `.btn-danger`: só o botão que confirma uma exclusão, dentro do diálogo. Fundo `danger-solid` com texto `on-danger` (4,8:1).
- `.btn-link`: ação textual mínima (Sair, no menu). `text-muted`, sem caixa.

O consumidor fornece o rótulo (um verbo) e o estado `disabled`; enquanto a ação roda, troque o rótulo para o gerúndio ("Enviando..."). Desabilitado = opacidade 0,5. Não use o azul de marca em botões e nunca use vermelho fora da confirmação final.
