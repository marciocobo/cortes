# Sidebar

Drawer de navegação de 240px com o logotipo, os links permitidos ao papel do usuário e a caixa do usuário no rodapé.

`.sidebar` (fundo `panel`, borda direita `border`, padding 24px 20px) contém `.logo` (`wordmark` em `accent-blue`), um `<nav>` com links (`text-dim`, `radius-md`; ativo ou hover: fundo `panel` e `text`) e `.user-box` (nome, papel em `accent-blue` 0,75rem/600, botão Sair). Abre e fecha pelo `.hamburger-btn` fixo (40px, 16px do canto), que fica acima do drawer (z 60 sobre 50).

Como o drawer também é `panel`, o fundo do link ativo não aparece: o que marca a página atual é só a troca de `text-dim` para `text`.

Links por papel: Vídeos (Clipador, Admin), Enviar Vídeo (Uploader, Admin), Configurações (Admin). O consumidor fornece papel, nome e o estado aberto/fechado.
