## Purpose

Extrai um único clipe contínuo cobrindo toda a pregação de um culto — do início ao fim da mensagem, excluindo abertura, avisos, dízimo/oferta, louvor e encerramento — mantendo o formato original do vídeo, com atenuação best-effort de música/teclado de fundo, como um workflow n8n dedicado e independente do pipeline de Shorts ("Blocos"), acionado quando uma submissão do Clip Studio é enviada em modo Palavra Completa.

## Requirements

### Requirement: Clipe único cobre do início ao fim contínuo da pregação
O workflow SHALL identificar o timestamp de início da pregação (o primeiro ponto de conclusão pertencente à fase `pregacao`, incluindo qualquer introdução feita pelo próprio pregador) e o timestamp de fim da pregação (o último ponto de conclusão pertencente à fase `pregacao`, mesmo que música/teclado de fundo já tenha começado a tocar antes desse ponto) e SHALL cortar um único clipe contínuo entre esses dois timestamps, sem dividir em múltiplos clipes e sem aplicar o teto de 180s usado no pipeline de Shorts.

#### Scenario: Música de fundo começa antes do fim da pregação
- **WHEN** o pregador continua falando (conteúdo classificado como `pregacao`) enquanto uma música/teclado de fundo já começou a tocar
- **THEN** o timestamp de fim do clipe único SHALL corresponder ao fim real da fala de pregação (não ao momento em que a música começou), incluindo esse trecho com música de fundo dentro do clipe

#### Scenario: Introdução do pregador antes da transição formal do culto
- **WHEN** o pregador começa a falar sobre o tema da mensagem antes do bloco de transição/abertura ter formalmente terminado, e esse trecho é classificado como `pregacao` (e não `abertura`)
- **THEN** o timestamp de início do clipe único SHALL incluir esse trecho inicial

### Requirement: Fases não-pregação são excluídas do clipe único
O workflow SHALL reutilizar a mesma classificação de 5 fases já usada no pipeline de Shorts (abertura, avisos, dizimo_oferta, louvor, encerramento) para determinar os limites do clipe — nenhum trecho classificado como uma dessas 5 fases SHALL ficar incluído no clipe único, mesmo quando adjacente ao início ou fim da pregação.

#### Scenario: Encerramento logo após o fim da pregação
- **WHEN** a pregação termina e o culto entra imediatamente em oração final/bênção apostólica (fase `encerramento`)
- **THEN** o clipe único termina no fim da pregação, sem incluir o trecho de encerramento

### Requirement: Formato original do vídeo é preservado
O corte do clipe único SHALL manter a proporção/orientação original do vídeo de origem (tipicamente paisagem) — o filtro de crop 9:16 usado no pipeline de Shorts NÃO SHALL ser aplicado a este clipe.

#### Scenario: Vídeo fonte em paisagem 16:9
- **WHEN** o vídeo de origem está em 16:9 paisagem
- **THEN** o clipe único gerado também está em 16:9 paisagem, sem crop vertical

### Requirement: Atenuação best-effort de música/teclado de fundo
O corte final SHALL aplicar um filtro de áudio ffmpeg (ex.: filtros de frequência focados na faixa de voz humana, ou cancelamento de canal central quando o áudio de origem for estéreo) sobre o clipe único, com o objetivo de reduzir a intensidade perceptível de música/teclado instrumental de fundo, sem exigir instalação de runtime de separação de voz (ex. Demucs/Spleeter) na VPS. Esta é uma atenuação aproximada — o sistema NÃO SHALL prometer remoção completa/perfeita da música de fundo.

#### Scenario: Trecho com música de fundo suave sob a voz do pregador
- **WHEN** o clipe único contém um trecho em que música/teclado toca de fundo enquanto o pregador fala
- **THEN** o áudio de saída desse trecho SHALL ter o filtro de atenuação aplicado, reduzindo (mas não necessariamente eliminando) a intensidade percebida do instrumental em relação à voz

### Requirement: Falha segura quando não há trecho de pregação identificável
Quando a IA não conseguir identificar nenhum trecho classificado como `pregacao` no vídeo, o workflow SHALL terminar sem gerar clipe e sem marcar a execução como erro, análogo ao comportamento já existente de "Ranking dos Blocos"/"Selecionar Vídeo" no pipeline de Shorts.

#### Scenario: Vídeo sem nenhum trecho de pregação
- **WHEN** todos os blocos do vídeo são classificados como abertura/avisos/dizimo_oferta/louvor/encerramento
- **THEN** a execução termina com uma mensagem explicativa e status de sucesso (não erro), sem produzir nenhum clipe único

### Requirement: Fila própria e trava compartilhada com o pipeline de Shorts
O workflow SHALL processar vídeos da sua própria fila (uma subpasta dedicada do OneDrive) um de cada vez, usando a mesma trava de execução por arquivo (lock) já usada pelo pipeline de Shorts — nunca rodando uma transcrição whisper.cpp deste workflow ao mesmo tempo que uma transcrição whisper.cpp do pipeline de Shorts, para não competir pelos mesmos núcleos de CPU da VPS. Quando a trava estiver ocupada, a execução SHALL terminar sem erro e sem processar, confiando em um novo disparo (self-chaining ou agendamento periódico) para tentar novamente.

#### Scenario: Pipeline de Shorts está transcrevendo quando a Palavra Completa tentaria rodar
- **WHEN** o pipeline de Shorts já detém a trava de execução (whisper.cpp em andamento) no momento em que uma execução do workflow Palavra Completa seria disparada
- **THEN** a execução do Palavra Completa termina com sucesso (sem processar nenhum vídeo) em vez de rodar whisper.cpp simultaneamente, e um disparo agendado subsequente eventualmente processa o vídeo pendente quando a trava estiver livre

#### Scenario: Fila com mais de um vídeo pendente
- **WHEN** existe mais de um vídeo elegível na fila dedicada da Palavra Completa
- **THEN** o workflow processa um vídeo por vez, movendo cada original processado para fora da fila de entrada antes de considerar o próximo

### Requirement: Resultado listado junto com os Shorts
O clipe único e seus metadados SHALL ser upados para uma subpasta do OneDrive distinta da saída de Shorts, de forma que a listagem de clipes do Clip Studio (`clip-studio/video-library`) consiga incluir e identificar esse clipe como resultado do modo Palavra Completa.

#### Scenario: Clipe único aparece na listagem consumida pelo Clip Studio
- **WHEN** o workflow Palavra Completa termina com sucesso e gera um clipe único
- **THEN** o clipe e seu `_meta.json` ficam disponíveis em uma pasta que a listagem de clipes do Clip Studio também consulta, com um sinal (campo de metadado ou pasta de origem) que permite diferenciá-lo de um Short
