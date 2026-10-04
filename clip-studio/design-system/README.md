Clip Studio é o painel interno onde a equipe envia vídeos longos de culto (pregação, louvor) e podcasts para a esteira n8n e depois revisa, corta e baixa os clipes gerados. É uma ferramenta de trabalho, escura, densa e silenciosa: o conteúdo (o vídeo) é a única coisa colorida na tela, e a interface fica em preto, branco e um único azul.

Use estas regras ao construir qualquer tela nova do Clip Studio ou qualquer peça que precise parecer parte dele.

## Conteúdo e voz

- Escreva em português do Brasil, em frases curtas e diretas, no imperativo para ações: "Cole o link do vídeo completo do YouTube.", "Selecione um tipo para ver os vídeos."
- Botões dizem a ação em um verbo: **Enviar**, **Salvar**, **Cancelar**, **Excluir**. Durante a ação, use o gerúndio com reticências: "Enviando...".
- Títulos de página são substantivos curtos com inicial maiúscula (**Vídeos**, **Enviar Vídeo**, **Configurações**), sempre com um eyebrow acima em caixa alta (`eyebrow-label`): **Biblioteca**, **Automação**, **Administração**.
- Use os nomes do domínio como o time fala: Pregação, Louvor, Podcast, Palavra Completa, Música completa, Shorts, clipe, corte. Os status de envio são Fila, Baixando, Processando, Concluído, Erro. Os status de clipe são Original, Rascunho, Cortado, Processando.
- Estados vazios explicam o que falta, sem desculpas: "Nenhum vídeo encontrado com status \"Cortado\" em Louvor."
- Confirmações destrutivas dizem o objeto e a consequência: "Tem certeza que deseja excluir \"…\"? Essa ação não pode ser desfeita."
- Sem emoji, sem exclamação, sem gírias de marketing.

## Fundamentos visuais

### Cor

- O app tem só tema escuro. O fundo da página é `bg` com dois brilhos radiais por cima (`glow-indigo` no canto superior esquerdo, `glow-blue` no superior direito). Não pinte seções inteiras com outras cores.
- Superfícies elevadas (cards, drawer, selects, diálogos) usam `panel` com borda de 1px em `border`. Diálogos e o card de login trocam a borda por `border-strong`, o contorno índigo que marca "isto está por cima de tudo".
- Texto principal em `text`; secundário (labels, meta, links inativos, Cancelar) em `text-dim`. `text-faint` só aparece sobre o poço preto `media-well`.
- `accent-blue` é a cor da marca e aparece em pouca área: o logotipo, os eyebrows, o texto dos pill-toggles inativos, o trecho selecionado no corte, o Switch ligado, o badge Palavra Completa e o anel de foco. Não use em fundos grandes.
- A ação principal é branca: `accent` com texto `accent-fg` (`.btn-primary`, pill-toggle ativo). Filtros ativos e o botão Salvar dos diálogos usam `text-bright` com texto `ink`.
- Status de envio são pílulas preenchidas: `status-fila`, `status-baixando` e `status-erro` com texto branco; `status-processando` e `status-concluido` com texto `accent-fg`. Status de clipe são pílulas em contorno, na cor do status. A pílula sempre traz a palavra; nunca dependa só da cor.
- Tipos de conteúdo têm cor própria, com texto `ink`: `type-pregacao`, `type-louvor`, `type-podcast`. São a única cor quente/pastel da interface.
- `danger` só aparece no botão que confirma a exclusão, dentro do diálogo, e em mensagens de erro. O ícone de lixeira no card fica neutro (`icon-btn-dim`).
- Contraste conhecido: texto branco sobre `status-baixando` e `status-erro` fica em 3,7:1, abaixo de 4,5:1 nos 12px usados. `border` (1,4:1) e `border-strong` (2,6:1) são decorativos e não chegam a 3:1 como borda de controle. Os valores foram mantidos como estão no código.

### Tipografia

- Toda a interface usa a fonte do sistema (`--font-sans`). IBM Plex Mono (`--font-mono`, pesos 500/600) aparece em só dois lugares: o logotipo `wordmark` e o `eyebrow-label`.
- Um `display` (30px, peso 400, -0,5px) por página, sempre sob um eyebrow. Títulos de diálogo usam `title-modal` (18px/500).
- Labels de campo e meta em `label` (0,8rem, `text-dim`). Pílulas, filtros e timecodes ficam entre 0,7rem e 12px (`badge-label`, `pill-label`, `caption`).
- Pesos: 400 para texto, 500 para nomes de clipe e botões de diálogo, 600 para a ação principal e pílulas de status. Não use 700.

### Espaço e layout

- Ritmo vertical de formulário: cada `.field` tem 16px (`space-16`) abaixo. Grupos de pílulas e rodapés de diálogo usam gap de 8px (`space-8`).
- Cards de formulário: padding de 24px (`space-24`), largura máxima `form-max` (560px). Coluna principal até `content-max` (1100px), com 72px no topo (`space-72`) para o botão de menu fixo.
- A grade de vídeos tem 3 colunas, 2 abaixo de 900px e 1 abaixo de 540px, com gap de 24px. O número de colunas segue a largura da janela, não do container, para não mudar quando o menu abre.
- A navegação é um drawer de 240px (`sidebar-width`) aberto pelo botão hambúrguer fixo no canto superior esquerdo. Acima de 720px o conteúdo é empurrado; abaixo, o drawer cobre o conteúdo sobre o `backdrop`.
- Abaixo de 720px tabelas viram listas: cada célula ganha um rótulo à esquerda vindo de `data-label`.

### Raios, bordas e sombras

- Pílula (`radius-pill`) para tudo que é clicável e compacto: botão principal, toggles, filtros, status, badges, botões de ícone, Switch.
- Cards e diálogos: `radius-xl` (10px). Inputs, select e o botão de menu: `radius-lg` (8px). Botões secundário e de perigo, inputs do admin e o badge de duração: `radius-sm` (4px).
- Separação por borda, não por sombra. A única sombra é `shadow-dialog`, no card de login.
- Foco de teclado: `focus-ring` (anel sólido de 2px em `accent-blue`) só em `:focus-visible`. Elementos redondos suprimem o destaque de toque retangular do navegador mobile.

### Movimento

- Mínimo e funcional: o drawer e o deslocamento do conteúdo animam em 0,2s ease; o knob do Switch em 0,15s; o skeleton pisca em 1,4s ease-in-out. Nada mais se move. Respeite `prefers-reduced-motion`.

### Imagem e mídia

- Thumbnails de clipe ficam num quadro 16:9 com gradiente `thumb-from`→`thumb-to` e `object-fit: contain`, porque os Shorts são 9:16 e não podem ser cortados na miniatura. Sem thumbnail, mostre só o triângulo `play-glyph`.
- A duração vai num badge `duration-bg` no canto inferior direito (6px de margem).
- O vídeo do diálogo de corte fica sobre `media-well`, sem forçar proporção: Palavra Completa e Podcast mantêm o quadro original.

## Iconografia

- Ícones de traço no estilo Lucide, desenhados à mão como SVG inline: viewBox 24, `stroke-width` 2, pontas e junções arredondadas, `currentColor`. Exibidos a 16px dentro do botão de ícone de 32px (`icon-button`).
- Conjunto atual em `assets/Icons/`: download, scissors (cortar), rename, trash, play, pause, stop, close, save e menu. Play/pause/stop são preenchidos.
- Ações em cards e no rodapé do corte são só ícone, sempre com `title` e `aria-label` em português (Baixar, Cortar, Excluir).
- Não há biblioteca de ícones instalada. Para um ícone novo, copie o desenho equivalente do Lucide com os mesmos atributos.
- Não use emoji.

## Logotipo

Não existe marca gráfica. O logotipo é o texto "Clip Studio" em `wordmark` (IBM Plex Mono 600, 1,1rem, 0,03em) na cor `accent-blue`. Fora do app, repita esse tratamento tipográfico; não desenhe um símbolo.

## Componentes

Os componentes abaixo são renderizações estáticas feitas com as classes reais do app (`components/bundle.css`), não uma biblioteca React. A primeira parte do stylesheet espelha `clip-studio/src/app/globals.css`. A segunda dá nome a padrões que hoje estão escritos como `style={{…}}` nos arquivos da tela (filtros, diálogos, Switch, badges de tipo, trilha de corte). Ao implementar, prefira essas classes a novos estilos inline.
