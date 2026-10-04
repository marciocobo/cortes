# SubmissionStatus

Badge tonal com o estado de um envio no Histórico de envios: Na fila, Baixando, Processando, Concluído, Erro.

`.pill` (12px/500, `radius-pill`, ponto à esquerda) mais uma variante: `.pill-fila`, `.pill-baixando`, `.pill-processando`, `.pill-concluido`, `.pill-erro`. Cada uma usa o `status-*-soft` de fundo e o `status-*` no texto e no ponto, com 5,5:1 ou mais nos dois temas. A palavra sempre aparece; a cor sozinha não basta.

Erro é um `<button class="pill pill-erro">` que abre o Histórico de tentativas; no hover ganha contorno na própria cor. Durante Baixando, ao lado vai `.progress-meta` (porcentagem · tempo, números tabulares). O consumidor fornece o status.
