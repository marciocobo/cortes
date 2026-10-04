# PageHeader

Cabeçalho de toda página: eyebrow em caixa alta, título e, opcionalmente, uma frase de instrução ou um controle à direita.

`<p class="eyebrow">` (`eyebrow-label`: Geist Mono 12px/500, 0,06em, `accent`, 4px abaixo) seguido de `<h1>` (`display`: 30px/600, -0,02em). Quando há um controle à direita, envolva os dois num `.page-header` (flex, `space-between`, alinhado pela base, 24px abaixo). Uma frase de apoio vai em `.page-intro` (`body-lg`, `text-muted`, até `form-max`). Títulos de seção abaixo do cabeçalho usam `.section-label` (13px/500, `text-muted`).

Pares em uso: Biblioteca / Vídeos, Automação / Enviar Vídeo, Administração / Configurações, Clip Studio / Entrar. O consumidor fornece eyebrow, título e o conteúdo opcional.
