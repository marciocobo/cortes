# Feedback

Mensagens de estado em texto: vazio, erro e sucesso.

- `.empty-state`: centralizado, `text-dim`, 40px acima e abaixo. Diz o que falta e, quando há filtro, qual: "Nenhum vídeo encontrado com status \"Cortado\" em Louvor." ou "Selecione um tipo para ver os vídeos."
- `.error-text`: 0,85rem em `danger`, logo acima do botão de envio ou no topo da lista. Diz o que deu errado e como resolver, sem pedir desculpas.
- Sucesso: texto em `status-concluido`, sozinho ou num Card com borda `status-concluido`.

O consumidor fornece a mensagem.
