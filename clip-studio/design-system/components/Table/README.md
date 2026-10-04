# Table

Tabela simples para listas do admin e do histórico de envios.

`<table>` a 100% com células de padding 10px 12px, 0,9rem e linha inferior `border`; cabeçalho em `text-dim`, peso 500. Abaixo de 720px cada linha vira um bloco e cada `<td>` mostra o rótulo vindo do atributo `data-label` (110px, 0,75rem, `text-dim`), então todo `<td>` precisa de `data-label`.

O consumidor fornece colunas, linhas e os `data-label`. Status dentro da tabela usam SubmissionStatus.
