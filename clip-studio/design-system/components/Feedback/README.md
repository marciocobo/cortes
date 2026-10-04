# Feedback

Mensagens de estado em texto: vazio, carregando, erro e sucesso.

- `.empty-state`: centralizado, `text-muted`, dentro de uma moldura tracejada `border` com `radius-lg` e 48px de respiro. Diz o que falta e, quando há filtro, qual: "Nenhum vídeo encontrado com status \"Cortado\" em Louvor." ou "Selecione um tipo para ver os vídeos."
- `.loading-text`: "Carregando..." em `text-muted`, para listas curtas. Na grade de vídeos use o Skeleton.
- `.error-text`: 13px em `danger`, logo acima do botão de envio ou no topo da lista. Diz o que deu errado e como resolver, sem pedir desculpas.
- `.success-text`: 13px em `status-concluido`. Para um resultado que precisa ficar visível (senha inicial), use `.callout-success` (ver Card).

Sem emoji, nem para sucesso ou erro. O consumidor fornece a mensagem.
