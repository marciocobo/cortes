# Field

Campo de formulário com rótulo acima: o bloco básico de todo formulário do app.

`.field` (16px abaixo) contém um `<label>` (`label`: 13px/500 em `text`, 8px acima do campo) e um `<input>` ou `<textarea>`: fundo `field`, contorno `border-control` (3:1+), `radius-md`, 36px de altura, texto 14px. Placeholder em `text-faint`. Hover clareia o contorno para `text-muted`; foco desenha o `focus-ring`. Fora de um `.field` (diálogo Renomear, formulário em linha do admin) use `.input-field`, com o mesmo visual; `.inline-form` alinha vários campos numa linha que quebra. `.input-mono` troca a fonte para Geist Mono 12px (cookies.txt).

Campos obrigatórios marcam o rótulo com " *". Placeholders mostram um exemplo real ("Ex: Podcast #58 - Convidado especial"). Abaixo de 720px o texto sobe para 16px para o iOS não dar zoom. O consumidor fornece `id`/`htmlFor`, rótulo, valor e placeholder. Erros vão numa `.error-text` logo acima do botão de envio, não no campo.
