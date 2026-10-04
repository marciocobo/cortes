# Field

Campo de formulário com rótulo acima: o bloco básico de todo formulário do app.

`.field` contém um `<label>` (0,8rem, `text-dim`, 6px abaixo) e um `<input>` (fundo `bg`, borda `border`, `radius-lg`, padding 10px 12px). Cada `.field` leva 16px de margem inferior. Nos formulários do admin e no diálogo Renomear, o input usa `.input-field` (fundo `field`, cantos `radius-sm`). Campos obrigatórios marcam o rótulo com " *". Placeholders mostram um exemplo real ("Ex: Podcast #58 - Convidado especial").

O consumidor fornece `id`/`htmlFor`, rótulo, valor e placeholder. Erros vão numa `.error-text` logo acima do botão de envio, não no campo.
