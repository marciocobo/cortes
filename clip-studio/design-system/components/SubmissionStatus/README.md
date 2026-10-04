# SubmissionStatus

Pílula preenchida com o estado de um envio no Histórico de envios: Fila, Baixando, Processando, Concluído, Erro.

`.pill` mais uma variante: `.pill-fila` (`status-fila`), `.pill-baixando` (`status-baixando`), `.pill-processando` (`status-processando`), `.pill-concluido` (`status-concluido`), `.pill-erro` (`status-erro`). Texto 0,75rem/600: branco em Fila, Baixando e Erro; `accent-fg` em Processando e Concluído. A palavra sempre aparece; a cor sozinha não basta.

O consumidor fornece o status. Contraste: branco sobre Baixando e Erro fica em 3,7:1, abaixo de 4,5:1, como no código atual.
