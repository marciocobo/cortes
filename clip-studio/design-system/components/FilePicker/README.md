# FilePicker

Área clicável que escolhe um arquivo de vídeo, no estilo de zona de envio.

O `<input type="file">` nativo fica oculto com `.visually-hidden` e é disparado por uma `.file-picker` (`role="button"`, `tabIndex=0`, Enter e Espaço também abrem). Sem arquivo: contorno tracejado `border-control`, fundo `field`, texto centralizado "Clique para selecionar um arquivo de vídeo" em `text-muted`; hover `surface-hover`. Com arquivo: acrescente `.has-file`, o contorno fica sólido e o nome aparece em `text` (quebra em qualquer ponto, para nomes longos).

O consumidor fornece o `accept` (ex: `video/*`) e o arquivo escolhido.
