# Sidebar

Drawer de navegação de 240px com o logotipo, os links permitidos ao papel do usuário e a caixa do usuário no rodapé.

`.sidebar` (fundo `surface`, borda direita `border`, padding 24px 12px) contém `.logo` (`wordmark` em `text`, alinhado à direita do botão de menu), um `<nav>` com links de 36px (ícone de 16px + rótulo, `control`, `text-muted`, `radius-md`; hover `surface-hover`) e `.user-box` (`.user-name`, `.user-role` em `accent` 12px/500, e o `.btn-link` Sair). O link da página atual recebe `.active`: fundo `surface-active`, texto `text` e ícone `accent`, visível contra o drawer.

Abre e fecha pelo `.hamburger-btn` fixo (40px, `radius-md`, 16px do canto), que fica acima do drawer (z 60 sobre 50). Abaixo de 720px o drawer cobre o conteúdo sobre o `backdrop`. Links por papel: Vídeos (Clipador, Admin), Enviar Vídeo (Uploader, Admin), Configurações (Admin). O consumidor fornece papel, nome e o estado aberto/fechado.
