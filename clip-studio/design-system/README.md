Clip Studio é o painel interno onde a equipe envia vídeos longos de culto (pregação, louvor) e podcasts para a esteira n8n e depois revisa, corta e baixa os clipes gerados. É uma ferramenta de trabalho, densa e silenciosa, no idioma visual dos painéis SaaS atuais: neutros zinc com leve viés frio, superfícies planas separadas por bordas finas, um único azul de marca e cor reservada para o que é estado ou conteúdo. O vídeo continua sendo a coisa mais colorida da tela.

Use estas regras ao construir qualquer tela nova do Clip Studio ou qualquer peça que precise parecer parte dele.

## Conteúdo e voz

- Escreva em português do Brasil, em frases curtas e diretas, no imperativo para ações: "Cole o link do vídeo completo do YouTube.", "Selecione um tipo para ver os vídeos."
- Botões dizem a ação em um verbo: **Enviar**, **Salvar**, **Cancelar**, **Excluir**. Durante a ação, use o gerúndio com reticências: "Enviando...".
- Títulos de página são substantivos curtos com inicial maiúscula (**Vídeos**, **Enviar Vídeo**, **Configurações**), sempre com um eyebrow acima em caixa alta (`eyebrow-label`): **Biblioteca**, **Automação**, **Administração**.
- Use os nomes do domínio como o time fala: Pregação, Louvor, Podcast, Palavra Completa, Música completa, Shorts, clipe, corte. Os status de envio são Na fila, Baixando, Processando, Concluído, Erro. Os status de clipe são Original, Rascunho, Cortado, Processando.
- Estados vazios explicam o que falta, sem desculpas: "Nenhum vídeo encontrado com status \"Cortado\" em Louvor."
- Confirmações destrutivas dizem o objeto e a consequência: "Tem certeza que deseja excluir \"…\"? Essa ação não pode ser desfeita."
- Sem emoji (nem em mensagens de sucesso ou erro), sem exclamação, sem gírias de marketing.

## Fundamentos visuais

### Temas

- Há dois temas, `dark` (padrão) e `light`. No app, as variáveis do tema escuro ficam em `:root` e o claro entra por `@media (prefers-color-scheme: light)`; não existe seletor manual. Toda cor do app vem de uma variável: nada de hex ou `rgba()` em estilo inline.
- Cada token de cor tem valor nos dois temas. Ao criar um par novo de texto e fundo, confira o contraste nos dois.

### Cor

- O chão da página é `bg` (zinc quase preto no escuro, `#fafafa` no claro) com um único brilho radial `glow` no topo, quase imperceptível. Não pinte seções inteiras com outra cor e não acrescente gradientes.
- Superfícies em degraus: `surface` para cards, drawer e login; `surface-raised` para diálogos; `surface-hover` para hover de itens, linhas e botões fantasma; `surface-active` para o item ativo do menu. Campos usam `field`.
- Bordas: `border` é o fio de cabelo decorativo de cards, diálogos, linhas de tabela e divisórias (abaixo de 3:1 de propósito). `border-control` é o contorno de controles que precisam de limite visível (inputs, select, seletor de arquivo, botão secundário, chips de filtro, Switch desligado) e passa de 3:1 sobre `bg`, `surface`, `field` e `surface-raised` nos dois temas.
- Texto principal em `text`; secundário (meta, rótulos de filtro, cabeçalhos de tabela, menu inativo, Cancelar) em `text-muted`; `text-faint` só para placeholder e para a mensagem sobre o poço de mídia.
- `accent` é o azul da marca e aparece em pouca área: eyebrows, o papel do usuário, o ícone do item ativo do menu, links em tabelas, chips de filtro ativos (texto e borda sobre `accent-soft`), Switch ligado, trecho e alças do corte, o badge Palavra Completa e o anel de foco. Texto sobre preenchimento azul usa `on-accent`. Não use o azul em fundos grandes nem em botões.
- A ação principal é neutra e invertida: `primary` com texto `on-primary` (quase branco no escuro, quase preto no claro), em `.btn-primary`, `.btn-light` e `.icon-btn-solid`. A escolha mantém o azul raro, para que ele continue significando seleção e foco, e segue a hierarquia que o app já tinha (ação principal branca).
- Status são badges tonais: fundo translúcido `status-*-soft` com texto e ponto na cor `status-*`. Envio: `pill-fila`, `pill-baixando`, `pill-processando`, `pill-concluido`, `pill-erro`. Clipe: `clip-status-original` (tons de Fila), `-rascunho` (Processando), `-cortado` (Concluído), `-processando` (Baixando). A palavra sempre aparece; a cor nunca é o único sinal.
- Tipos de conteúdo usam o mesmo estilo tonal, sem ponto: `type-pregacao`, `type-louvor` (também Música completa), `type-podcast`, e `type-palavra-completa` em `accent-soft`/`accent`. Essas cores não servem para mais nada.
- Vermelho: `danger` só no texto de erro; `danger-solid` com `on-danger` só no botão que confirma a exclusão, dentro do diálogo. A lixeira no card fica neutra (`icon-btn-dim`).
- Contraste dos pares de texto (escuro / claro): `text` 15,7–19:1 / 18–19,9:1; `text-muted` 6,4–7,8:1 / 7,0–7,7:1; `accent` sobre `bg`/`surface` 6,8–7,2:1 / 5,0–5,2:1; status e tipos sobre o próprio fundo tonal 5,6–9,7:1 / 4,65–6,8:1; `on-danger` sobre `danger-solid` 4,8:1. Os pares antigos que falhavam (branco sobre azul e sobre vermelho) não existem mais.

### Tipografia

- Toda a interface usa Geist (`--font-sans`), carregada por `next/font/google` em `layout.tsx`, pesos 400/500/600. Geist Mono (`--font-mono`, 500/600) aparece em só dois lugares: o logotipo `wordmark` e o `eyebrow-label`.
- Escala fechada: 12, 13, 14, 16, 20, 24 e 30px. Um `display` (30px/600, -0,02em) por página, sempre sob um eyebrow. `title-section` (20px/600) nos títulos de card, `title-lg` (24px) no login, `title-modal` (16px/600) nos diálogos.
- O corpo é `body` a 14px. A introdução da página usa `body-lg` (16px) em `text-muted`. Rótulos de campo usam `label` (13px/500) em `text`. Meta, select e subtítulos usam `small` (13px). Datas, timecodes e dicas usam `caption` (12px). Badges e chips usam `badge` (12px/500).
- Títulos levam letter-spacing levemente negativo. Durações, datas e timecodes usam `font-variant-numeric: tabular-nums` (classe `.tabular` ou o próprio componente).
- Pesos: 400 para texto, 500 para controles, rótulos e nomes de clipe, 600 para títulos. Não use 700.
- Abaixo de 720px os campos sobem para 16px, para o iOS não dar zoom ao focar.

### Espaço e layout

- Escala de 4px: `space-4`, `space-8`, `space-12`, `space-16`, `space-20`, `space-24`, `space-32`, `space-40`, `space-48`, `space-64`, `space-72` (mais `space-2` como meio passo). Não use valores fora dela.
- Ritmo de formulário: cada `.field` tem 16px abaixo; rótulo a 8px do campo. Cards de formulário (`.form-card`) têm padding de 24px e largura máxima `form-max` (560px). A coluna principal vai até `content-max` (1100px), com 72px no topo para o botão de menu fixo.
- A grade de vídeos tem 3 colunas, 2 abaixo de 900px e 1 abaixo de 540px, com gap de 16px. O número de colunas segue a largura da janela, não do container, para não mudar quando o menu abre.
- A navegação é um drawer de 240px (`sidebar-width`) aberto pelo botão hambúrguer fixo no canto superior esquerdo. Acima de 720px o conteúdo é empurrado; abaixo, o drawer cobre o conteúdo sobre o `backdrop`.
- Abaixo de 720px tabelas viram listas: cada célula ganha um rótulo à esquerda vindo de `data-label`.

### Raios, bordas e sombras

- `radius-md` (8px) em todo controle: botões, inputs, select, seletor de arquivo, botões de ícone, itens do menu, hambúrguer. `radius-sm` (6px) nos segmentos dentro de um `.toggle-group`. `radius-lg` (12px) em cards. `radius-xl` (16px) em diálogos e no card de login. `radius-xs` (4px) no badge de duração, na trilha de corte e no skeleton.
- `radius-pill` só em badges de status e tipo, chips de filtro e no Switch. Botões nunca são pílula.
- Separação por borda fina, não por sombra. `shadow-sm` dá só um leve relevo a cards, ao segmento ativo, ao knob e às alças. `shadow-dialog` vai em diálogos e no login, sobre o `overlay` com desfoque de 4px.
- Foco de teclado: `focus-ring` (2px no tom do chão + 2px de `accent`) só em `:focus-visible`. Elementos arredondados suprimem o destaque de toque retangular do navegador mobile.
- Nada de borda colorida só à esquerda, glassmorphism ou gradiente roxo-azul.

### Estados e movimento

- Hover troca o fundo por `surface-hover` (ou `primary-hover` na ação principal); controles com contorno também clareiam a borda. Desabilitado: opacidade 0,5 (0,4 em chips e botões de ícone).
- Transições de 150ms (`duration-fast`) em fundo, cor, borda e sombra; o drawer e o deslocamento do conteúdo em 200ms (`duration-drawer`); o skeleton pisca em 1,4s. Com `prefers-reduced-motion`, tudo isso para.

### Imagem e mídia

- Thumbnails de clipe ficam num quadro 16:9 com gradiente `thumb-from`→`thumb-to` e `object-fit: contain`, porque os Shorts são 9:16 e não podem ser cortados na miniatura. Sem thumbnail, mostre só o triângulo `play-glyph`.
- A duração vai num badge `duration-bg` com texto `on-media`, no canto inferior direito (8px de margem), em números tabulares.
- O vídeo do diálogo de corte fica sobre `media-well`, sem forçar proporção: Palavra Completa e Podcast mantêm o quadro original. O diálogo limita a altura com `svh` para o rodapé nunca sumir atrás da barra do navegador mobile.

## Iconografia

- Ícones de traço no estilo Lucide, desenhados à mão como SVG inline: viewBox 24, `stroke-width` 2, pontas e junções arredondadas, `currentColor`. Exibidos a 16px dentro do botão de ícone de 32px (`control-sm`) ou ao lado do rótulo no menu.
- Conjunto em `assets/Icons/`: download, scissors (cortar), rename, trash, play, pause, stop, close, save, menu, film, upload, settings e refresh. Play/pause/stop são preenchidos. Nos arquivos a tinta é #80808a, que lê sobre os dois temas.
- Ações em cards e no rodapé do corte são só ícone, sempre com `title` e `aria-label` em português (Baixar, Cortar, Excluir). No menu, o ícone é decorativo (`aria-hidden`) e o rótulo vem escrito.
- Não há biblioteca de ícones instalada. Para um ícone novo, copie o desenho equivalente do Lucide com os mesmos atributos e adicione-o a `assets/Icons/` antes de usar.
- Não use emoji.

## Logotipo

Não existe marca gráfica. O logotipo é o texto "Clip Studio" em `wordmark` (Geist Mono 600, 16px, -0,01em) na cor `text`. Fora do app, repita esse tratamento tipográfico; não desenhe um símbolo.

## Componentes

Os componentes abaixo são renderizações estáticas feitas com as classes reais do app (`components/bundle.css`), não uma biblioteca React. O stylesheet espelha `clip-studio/src/app/globals.css` classe por classe; os tokens vêm deste `tokens.json`. Ao implementar uma tela, use essas classes e as variáveis; um estilo inline só para geometria dinâmica (posição na trilha, `max-width` do diálogo, altura do vídeo).
