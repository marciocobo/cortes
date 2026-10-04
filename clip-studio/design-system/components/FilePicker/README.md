# FilePicker

Caixa clicável que escolhe um arquivo de vídeo, com o mesmo visual dos outros campos.

O `<input type="file">` nativo fica visualmente oculto e é disparado por uma `.file-picker` (`role="button"`, `tabIndex=0`, Enter e Espaço também abrem). Sem arquivo, mostra "Clique para selecionar um arquivo de vídeo" em `text-dim`; com arquivo, acrescente `.has-file` e mostre o nome em `text`.

Extraído dos estilos inline de `SubmitForm.tsx`. O consumidor fornece o `accept` (ex: `video/*`) e o arquivo escolhido.
