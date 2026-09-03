# n8n Shorts Generator — Contexto do Projeto

## O que é este projeto

`n8n-video-silence-cutter.html` — arquivo HTML single-file que gera workflows JSON para o n8n automatizar o corte de YouTube Shorts a partir de vídeos longos (pregações/palestras) armazenados no OneDrive.

Fluxo geral: vídeo no OneDrive → whisper.cpp (transcrição local, sem pontuação) → IA avalia trechos → FFmpeg corta e redimensiona para 9:16.

Após cada mudança no HTML, o usuário precisa **reimportar o JSON gerado no n8n** — o workflow em produção não se atualiza sozinho.

---

## Estado atual (julho/2026)

**Única opção em uso: Opção 3 (Blocos).** As Opções 1 (Semântico) e 2 (Simples) não estão sendo usadas e não precisam ser mantidas.

**Bug crítico corrigido — whisper.cpp entrava em loop de alucinação e engolia pregação inteira, sem erro visível (02/09/2026):** a execução #1186 (vídeo "Igreja Mahanaim Culto Ao Vivo - 01/09/2026 | Pr. Marcos Xavier", 96min) falhou no "Montar Clipes" com a 2ª IA retornando 0 clipes. Investigação revelou que o whisper.cpp colapsou quase os 90 minutos finais do vídeo (do minuto 6:42 até o fim) em um único segmento SRT contendo a mesma frase de louvor ("Não há ninguém igual a Ti, Deus") repetida centenas de vezes, seguida de um rodapé fantasma ("Legenda por Sônia Ruberti") — uma alucinação clássica do Whisper, completamente desconectada do áudio real. Transcrevendo manualmente amostras isoladas de 3min em vários pontos do vídeo (15/30/45/60/75/90min), confirmou-se que **havia uma pregação real e substancial sobre a ressurreição de Lázaro entre os minutos ~45 e ~85** (Adão e Eva → João 11, Lázaro/Marta/Maria → apelo de altar emocional), nunca vista por nenhuma das duas IAs porque a transcrição principal nunca a capturou. **Causa raiz:** o whisper.cpp usa por padrão a transcrição já gerada como contexto/prompt para a próxima janela de decodificação (`--max-context`, default `-1` = ilimitado) — quando ele aluciona uma vez (comum em trechos com música de fundo contínua durante a fala, cama instrumental típica de culto carismático), essa alucinação vira contexto da próxima janela e o loop se autoalimenta indefinidamente, sem nunca se recuperar. **Fix validado e aplicado (nos três lugares — n8n via MCP + `publish_workflow`, HTML, `workflow-blocos.json`):** adicionada a flag `-mc 0` (desliga o uso de contexto entre janelas) ao comando do whisper.cpp em "Whisper.cpp Transcrever" (e no node dormente "Whisper.cpp Transcrever Clipe", por consistência, embora legendas estejam desabilitadas). Validado na própria VPS antes de aplicar: re-transcrever manualmente os mesmos 30 minutos problemáticos (min 5–35) com `-mc 0` produziu segmentação granular e coerente (louvor → avisos → apelo de dízimo), sem nenhum loop de repetição. **Trade-off aceito conscientemente:** sem o contexto entre janelas a decodificação fica mais lenta (o teste de 30min de áudio levou ~43min de processamento, mais lento que tempo real) — ainda assim compatível com a escala de horas já observada para o pipeline completo. Ver seção "Bug corrigido — whisper.cpp em loop de alucinação (`-mc 0`)" abaixo para os detalhes completos da investigação. **✅ Validado com execução real de ponta a ponta (02–03/09/2026, execução #1291):** o Schedule Trigger ("A Cada 6 Horas") disparou sozinho às 22:00:13 UTC de 02/09 e reprocessou exatamente o mesmo vídeo que causou o bug original (mesmo `id` do OneDrive, mesma duração 5760s/96min). Rodou 2h41min (até 00:41:48 UTC de 03/09) e completou com sucesso — `Loop Over Items` processou 6 clipes, todos com `exitCode:0` na limpeza. O clipe 1 (start=2194.6s/36:34, end=2330.36s/38:50) tem hook **"Abre a sua Bíblia comigo João capítulo 11"** e reason mencionando a história de Lázaro — exatamente o trecho que a alucinação tinha engolido por completo antes do fix. O vídeo original foi movido para `Videos-Cortes/Videos` (`Mover Vídeo Processado` com sucesso) e a fila ficou vazia (`Decidir Próximo Vídeo` retornou `[]`) — confirmado também pelas 3 checagens agendadas seguintes (#1292, #1293, #1294), todas `success` em ~5-6s (sem vídeo novo, comportamento esperado). **Fix confirmado funcionando em produção — não é mais necessário revalidar isoladamente.**

**Auditoria de qualidade dos 6 clipes via agente `clipador` (03/09/2026):** validado start/end real (`real_start`/`real_end`, não o bruto) dos 6 clipes contra o vídeo original por detecção de silêncio, com threshold recalibrado para este vídeo (-25dB — piso de ruído ambiente alto, -12 a -14dB de `mean_volume`, provável cama de música/culto ao vivo constante). Resultado: **3/6 OK (clipes 01, 04, 05), 1/6 SUSPEITO (clipe 06, fim), 2/6 RUIM (clipe 02 início, clipe 03 fim — ambos confirmados visualmente por frame, gesto de mão em movimento = fala ativa, sem pausa acústica encontrada em nenhum threshold testado)**. Taxa de 33% RUIM, melhor que os 45-50% pré-fix e dentro da faixa 8-46% já observada em auditorias pós-fix anteriores — evidência indireta de que o `-mc 0` funcionou (a pregação de Lázaro chegou íntegra às duas IAs, não é mais o bug de colapso). **Zero violações de duração/gap-piso/overlap/vazamento de fase.** Achado residual (já conhecido, não um bug novo): gap real entre clip5→clip6 ficou em 10.53s, abaixo do piso pretendido de 15s (mas positivo, sem overlap) — mesmo padrão de "erosão combinada" da auditoria de 17/08/2026 (o clamp de colisão compara só contra o valor bruto do vizinho, não o já ajustado). Os 2 casos RUIM continuam sendo o gargalo estrutural já documentado (30/07/2026): sem pausa acústica real na janela de busca, nenhum ajuste de threshold resolve — exigiria fix na escolha do `start`/`end` pela própria IA (abordagens #3/#5 do "Bug pendente"), ainda não implementado.

**Legendas desabilitadas (08/07/2026):** a pedido do usuário, o pipeline não queima mais legendas nos clipes finais. Ver seção "Legendas — desabilitadas" abaixo para detalhes técnicos da mudança.

**Primeira validação real do fix de checklist de janelas (08/07/2026) — execução #15, sucesso parcial:** rodou o vídeo "Quem é você depois do culto? — 14/06/2026" pela primeira vez com o checklist de 6 janelas + sem legenda. 6 clipes foram cortados com sucesso e os timestamps confirmam que o viés de atenção foi corrigido: clip 1 em 145–213s, clip 2 em 340–411s, clip 3 em 1170–1259s (quase 20min) — bem distribuídos ao longo do vídeo, não mais concentrados nos primeiros minutos. **O fix do checklist parece estar funcionando.** Ainda não confirmado se os cortes mid-reasoning (bug histórico prioritário) desapareceram — precisa assistir os clipes.

**Novo bug encontrado nesta execução — 504 Gateway Timeout no upload (08/07/2026):** no upload do 6º clipe (31.7MB) para o OneDrive, a Microsoft Graph API retornou `504 Gateway timed out` após 42.6s de tentativa. Os 5 clipes anteriores (20.9–34.1MB) fizeram upload normalmente em 14–18s cada, então não é um problema de tamanho de arquivo — é uma falha transitória do lado da Microsoft (comum em uploads grandes sequenciais, possívelmente throttling). **Fix aplicado:** habilitado `retryOnFail` (5 tentativas, 5s de espera entre elas) nos nodes "Upload Short → OneDrive" e "Upload Metadados → OneDrive", e também em "Baixar Vídeo" (3 tentativas) por prevenção — essas são as três chamadas de rede mais pesadas do workflow e as mais suscetíveis a timeouts transitórios do OneDrive. Aplicado via `update_workflow` (operação `setNodeSettings`) diretamente no workflow `ID4wisnN4Tqpt2zh` e retroportado para `n8n-video-silence-cutter.html` e `workflow-blocos.json` (campos `retryOnFail`/`maxTries`/`waitBetweenTries` a nível de node).

Para recuperar a execução #15 sem reprocessar o vídeo inteiro (2h+ de whisper.cpp + IA), a opção mais rápida é usar o botão "Retry" na lista de execuções do n8n — ele reaproveita os dados já processados e tenta de novo só a partir do node que falhou.

**Bug do arquivo 0 bytes / "moov atom not found" (09/07/2026):** vídeo baixado do OneDrive com 0 bytes porque ainda estava sincronizando quando o workflow rodou — o FFmpeg reportava erro de container corrompido, mas a causa real era um arquivo vazio. Corrigido com validação de tamanho mínimo (1MB) no node "Selecionar Vídeo", nos três lugares. Ver seção "Bug corrigido — moov atom not found" abaixo.

**minBlockScore reduzido de 70 para 40 (09/07/2026):** após o fix acima, o vídeo "Fique Atento à Oportunidade || Culto Ao Vivo - 30/06/2026" processou corretamente (824MB, 45:53min, 4K) mas nenhum dos 8 blocos atingiu a nota mínima de 70 — validado que é conteúdo legítimo (culto completo com ~21min de leitura bíblica/repetição + só ~24min de ensino real, notas 44 e 57 no máximo). Threshold baixado para 40 como novo padrão, nos três lugares, a pedido explícito do usuário. Ver seção "minBlockScore reduzido de 70 para 40" abaixo. **Ainda não testado com reexecução real após a mudança.**

**Último run bem-sucedido:** vídeo "Quem é você depois do culto? — 14/06/2026 | Pr. Claudio Silva"
- 6 clipes gerados, gaps ≥ 20s entre todos (zero clipes contíguos)
- Scores: 89–95
- **Problema identificado:** cortes acontecem no meio do raciocínio — o pregador para por um instante (respiração) e a IA interpreta como fim de pensamento

**Fix aplicado em 06/07/2026 (aguardando validação com vídeo real):** implementada a abordagem #1 do bug de cortes mid-reasoning — PASSO 0 de pré-processamento do SRT (node "Mesclar Pausas Curtas"). Ver seção "Bug pendente" abaixo para detalhes e o que ainda falta testar.

**Fix aplicado em 07/07/2026 (aguardando validação com vídeo real):** checklist obrigatório de cobertura por janelas de tempo no PASSO 1/PASSO 2 do `sysFinal`, para corrigir um bug real de clustering (a IA concentrou 8 clipes nos primeiros 132.6s de um vídeo de 2529.6s — 42 minutos). Ver seção "Bug pendente" para detalhes. Este fix foi aplicado **diretamente no n8n via MCP** (workflow `ID4wisnN4Tqpt2zh`) e também retroportado para `n8n-video-silence-cutter.html` e `workflow-blocos.json`.

**Conexão MCP com n8n (07/07/2026):** o usuário conectou o n8n via MCP nesta sessão, permitindo que as mudanças sejam aplicadas diretamente no workflow em produção (`update_workflow`), sem precisar reimportar o JSON manualmente. Ver seção "Conexão MCP com n8n" abaixo para detalhes operacionais e um incidente de workflow duplicado que foi descoberto e resolvido.

**Trava de execução sequencial (13/07/2026):** disparei a execução #26 (vídeo Rodnei Romano, com o filtro de fase novo) para validação, e o usuário disparou uma execução #27 quase ao mesmo tempo com um segundo vídeo diferente. As duas ficaram "running" por 17+ horas sem completar nem o primeiro node — sintoma de 2 processos whisper.cpp `large-v3` brigando pelos mesmos 6 núcleos da VPS (cada execução roda com `-t 6`, então 2 simultâneas tentam usar 12 threads onde só cabem 6). O usuário cancelou uma execução manualmente e pediu uma trava para impedir isso de acontecer de novo. Implementado um lock de arquivo (`/home/node/.n8n-files/.processing.lock`) com expiração automática de 8h (para não travar para sempre se uma execução falhar sem limpar o lock) entre "Selecionar Vídeo" e "Baixar Vídeo". Ver seção "Trava de execução sequencial — 2 vídeos competindo pela VPS" abaixo para detalhes técnicos.

**Bug corrigido — crash de memória (OOM) no download do vídeo (13/07/2026):** com a trava já ativa, disparei a execução #29 (1 vídeo por vez). Ela avançou normalmente pelos nodes iniciais mas crashou no node "Baixar Vídeo" com `NodeCrashedError` — "n8n may have run out of memory". Causa: o node nativo do n8n para OneDrive (`microsoftOneDrive`, operação `download`) baixa o arquivo inteiro para a memória do processo Node.js antes de gravar em disco — os dois vídeos candidatos nesta pasta têm **10.07GiB e 7.82GiB** (4K, bitrate ~22.8Mbps, praticamente footage bruta de câmera — bem maiores que os 3.2GB estimados antes), o que estoura a memória disponível independente de quanta RAM a VPS tem no total. Fix: os dois nodes "Baixar Vídeo" (OneDrive) + "Salvar na VPS" (write binary file) foram substituídos por um único node Execute Command que baixa via streaming direto para o disco usando a URL de download direta do Graph API (campo `@microsoft.graph.downloadUrl`, já presente na resposta de "Listar Arquivos"/"Selecionar Vídeo") — sem nunca carregar o conteúdo na memória do n8n. Esse padrão já era usado no resto do pipeline (ffmpeg, whisper.cpp rodam via Execute Command, não via nodes nativos com binary data) — essa mudança só estende a mesma abordagem para o download.

**Correção adicional — curl não existe na VPS, trocado por wget (13/07/2026):** a primeira versão do fix acima usava `curl`, e a execução #32 falhou imediatamente com `/bin/sh: curl: not found`. Diagnóstico via node temporário (técnica descrita na seção "Conexão MCP com n8n" abaixo) rodando `cat /etc/os-release` + `which curl/wget/python3/node/aria2c`: a VPS roda **"Docker Hardened Images" (Alpine) v3.24**, uma imagem minimalista/hardened que não inclui `curl`, `python3` nem `aria2c` — só `wget` (`/usr/bin/wget`) e `node` (`/usr/local/bin/node`). Fix: comando reescrito para `wget -q --tries=5 --waitretry=10 -O <destino> <url>` (equivalente ao `curl -L --fail --retry 5 --retry-delay 10 --retry-connrefused -o`), mantendo a mesma validação de tamanho mínimo (1MB) depois do download. Aplicado nos três lugares (n8n via MCP, HTML, `workflow-blocos.json`), com `retryOnFail`/`maxTries:3`/`waitBetweenTries:5000` preservados a nível de node (camada de retry extra do próprio n8n, além dos `--tries` internos do wget).

**Lição para o futuro:** esta VPS é uma imagem Alpine hardened, não uma distro completa (Debian/Ubuntu) — qualquer novo comando via Execute Command deve assumir só as ferramentas mínimas do Alpine (`sh`, `wget`, coreutils básicos) e não binários comuns como `curl`, `python3`, `bash` (o shell é `/bin/sh`, não bash — evitar sintaxe bash-only tipo `[[ ]]` ou arrays).

**Execução #35 — trava e wget validados, novo bug encontrado no scoring de blocos (13/07/2026):** disparada às 14:15:11 UTC, rodou por 3h48min (até 18:03:39 UTC) processando o vídeo "Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano.mp4" (3751s/~62min) — passou por download (wget), whisper.cpp e divisão em blocos sem nenhum erro, confirmando que os fixes de trava sequencial e memória/wget funcionam de ponta a ponta. Falhou no node "Ranking dos Blocos" com `Nenhum bloco atingiu nota minima de 40` — todos os 18 blocos vieram com nota 5. Ver seção "Bug corrigido — IA zerava criteria e aplicava nota-teto de exclusão a blocos de pregação real" abaixo para a causa raiz e o fix.

**Bug do teto de 180s ignorado pela IA (12/07/2026):** vídeo "Não é o Fim, é o Crescimento || Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano" (7725s/128:45min) travou no "Montar Clipes" com zero clipes aprovados. Causa: o prompt `sysFinal` dizia à IA "sem teto fixo — capture o raciocínio completo" no PASSO 2, mas o código sempre teve um teto rígido de 180s (`dur > 180` descarta o clipe). Os 8 clipes retornados pela IA tinham 232–382s cada — todos acima do limite, todos descartados. Fix: prompt agora informa o teto de 180s explicitamente (PASSO 2, DURAÇÃO IDEAL e REGRAS INEGOCIÁVEIS) e instrui a IA a escolher um ponto de conclusão intermediário dentro do teto em vez de tentar capturar o raciocínio inteiro. Mensagem de erro do "Montar Clipes" também foi melhorada para diagnosticar a causa real (teto excedido vs. clustering vs. formato de timestamp) em vez de um texto genérico. Ver seção "Bug corrigido — teto de 180s ignorado pela IA" abaixo. **Ainda não testado com reexecução real após o fix.**

**Filtro de fase do culto — só cortar "a palavra" (12/07/2026):** a pedido explícito do usuário ("ignorar a abertura do culto, dízimo e oferta e apresentação, pegar somente a palavra para gerar os cortes"), os dois prompts de IA da Opção 3 agora excluem estruturalmente qualquer trecho de abertura/boas-vindas, avisos/recados, apelo de dízimos e ofertas, e louvor/música — só a pregação/mensagem principal pode virar clipe. Ver seção "Filtro de fase do culto — abertura/dízimo/avisos excluídos" abaixo para detalhes técnicos.

**Validação do filtro de fase com execução real (12/07/2026):** analisando a execução #25 (concluída 18:42, ANTES do filtro de fase — rodou só com o fix de teto de 180s), confirmado com dados reais que o problema é exatamente o que o usuário descreveu: dos 3 clipes que sobreviveram aos filtros de código e foram upados para o OneDrive, 2 de 3 (66%) eram conteúdo de louvor/abertura, não pregação — `melhor-lugar-presenca` (30–69.6s, hook: "Aleluia, eu não sei você, mas eu vim aqui somente para adorar a Ele") e `adoracao-verdadeira-transborda` (230–311.7s, sobre "adoração verdadeira"). Só o 3º clipe (`terceiro-poco-alargamento`, aos 6215s, ~80% do vídeo) era pregação de fato. Ver seção "Validação do filtro de fase — execução #25 vs #26" abaixo para a análise completa, incluindo um achado secundário sobre compliance parcial do teto de 180s pela IA. Execução #26 disparada no mesmo vídeo com os prompts corrigidos, para comparação direta — resultado ainda pendente (execução real leva ~5h neste vídeo de 128min).

**Fallback do Ranking dos Blocos validado com sucesso — execução #51 (14/07/2026):** após 3 falhas consecutivas do bug de scoring degenerado (execuções #35, #42, #47), o fix estrutural que torna o "Ranking dos Blocos" consultivo em vez de bloqueante (ver seção "Terceira falha consecutiva" abaixo) foi validado: a execução #51 completou o pipeline inteiro com sucesso, com scores desta vez genuinamente diferenciados (52/57/54/49 para pregação real, 4 para um trecho de louvor). 7 clipes gerados e enviados ao OneDrive. Ver seção "Execução #51" abaixo para detalhes, incluindo a questão em aberto sobre o reencode 1080p do vídeo processado.

**Bug corrigido — `_meta.json` nunca era gerado de verdade, desde 08/07/2026 (16/07/2026):** a pedido do usuário ("o meta dados não está sendo gerado no final"), investigação revelou que a pasta de saída no OneDrive nunca teve arquivos `.json` — só `.mp4`. Causa: o node "Upload Metadados → OneDrive" não respeita o parâmetro `fileName` configurado e sempre usa o nome do arquivo LOCAL (`clip_XX_meta.json`, genérico, igual para todo vídeo), fazendo cada execução sobrescrever os mesmos ~8 arquivos criados em 08–09/07. Fix: o nome local do arquivo de metadados agora usa o mesmo padrão final do vídeo (`short_XX_slug_meta.json`), corrigindo o problema independente do node respeitar ou não o parâmetro `fileName`. Ver seção "Bug corrigido — metadados nunca eram gerados de verdade" abaixo.

**Modelo whisper.cpp trocado para large-v3-turbo (16/07/2026):** a pedido do usuário ("tem alguma coisa mais rapido... pode trocar para large-v3-turbo"), o modelo de transcrição foi trocado de `ggml-large-v3.bin` para `ggml-large-v3-turbo.bin` — mesma arquitetura de encoder (32 camadas, preserva a maior parte da precisão), decoder reduzido de 32→4 camadas, ganho esperado de ~6-8x em velocidade. Descoberta no processo: `/models/` na VPS pertence a `root` e não é gravável pelo usuário `node` que roda o n8n — o modelo novo foi baixado com sucesso para `/home/node/.n8n-files/ggml-large-v3-turbo.bin` (pasta já usada e gravável pelo pipeline) em vez de `/models/`, e o comando do whisper foi apontado para esse novo caminho. Aplicado nos três lugares. Ver seção "Troca de modelo whisper.cpp — large-v3 → large-v3-turbo" abaixo. **Ainda não testado com uma execução real** — falta confirmar tempo de transcrição e qualidade em produção.

**Fila automática de vídeos — loop sequencial + arquivamento (14/07/2026):** a pedido do usuário ("identifique todos os videos que estão na pasta e roda sequencialmente... quando terminar mover para a pasta Videos-Cortes\Videos"), implementado um mecanismo de self-chaining: ao final de cada execução bem-sucedida, o workflow move o vídeo original processado para `Videos-Cortes/Videos`, relista a pasta de entrada e — se sobrar algum vídeo elegível — dispara automaticamente uma nova execução de si mesmo (assíncrona, `waitForSubWorkflow:false`) para o próximo vídeo, encadeando até a fila esvaziar. Aplicado nos três lugares. Ver seção "Fila automática — loop sequencial + arquivamento de vídeos processados" abaixo para detalhes técnicos, incluindo uma pegadinha de credenciais do MCP do n8n e uma descoberta sobre a organização real das pastas do usuário. **Ainda não testado com uma execução real do loop completo** — a pasta raiz está sem vídeos elegíveis no momento (por escolha do usuário, que preferiu não mover o vídeo do Pr. Daniel dos Santos de volta para a raiz).

**Auditoria de validação + 4 fixes aplicados (29/07/2026):** a pedido do usuário ("valide o processo de gerar cortes e melhore o máximo que você conseguir"), foi feita uma auditoria cruzando os 165 clipes/115 `_meta.json` já gerados na pasta `Videos-Cortes/Cortes`, o histórico de 67 execuções reais (via MCP) e o código do workflow em produção. Confirmado que o teto de 180s, o gap mínimo de 10s, `minBlockScore=40` e o modelo `large-v3-turbo` estão todos ativos e funcionando corretamente em produção. Foram encontrados e corrigidos 4 problemas reais (nenhum crítico, todos com evidência concreta de dados/execuções reais):
1. **Regex do nome do pregador não cobria "Miss.", "Ap.", "Pb.", "Bispo"** — 17 de 91 clipes elegíveis (19%) ficavam sem o prefixo no campo `reason` (ex: vídeos de Miss. Rejane Rosalina, Miss. Francine Piccinato). Regex ampliada para cobrir esses prefixos.
2. **"Aplicar Trava" ainda derrubava a execução inteira como `error` em colisão de lock** — mesma classe de problema já corrigida em 20/07 para fila vazia (`Selecionar Vídeo`), mas não replicada aqui. Confirmado com 4 execuções reais de 27/07 (#129, #131, #132, #133) marcadas `error` só por causa disso. Novo node IF "Trava Liberada?" segue o mesmo padrão do "Vídeo Encontrado?": lock ocupado agora retorna sucesso com mensagem em vez de lançar exceção.
3. **Campo `criteria` do `_meta.json` sempre vinha `null`** — "Ranking dos Blocos" nunca copiava o `criteria` que a própria IA retorna para dentro de `scoredBlocks`. Agora é propagado, facilitando diagnóstico futuro sem precisar puxar a resposta bruta da IA via `get_execution`.
4. **Prompt de seleção final não avisava a 2ª IA quando o "Ranking dos Blocos" caiu no fallback** — os blocos eram rotulados "Melhores blocos" mas carimbados com notas baixas (ex: "nota: 5/100"), um sinal contraditório que pode ter contribuído para o rendimento de só 1 clipe final na execução #78 (Pr. Marcos Xavier, vs. 5–8 usuais). Dois ajustes: a nota deixa de ser exibida quando o bloco vem do fallback (rótulo "candidato - sem nota confiável" no lugar), e um parágrafo de aviso explícito é injetado no prompt avisando a IA para não se ancorar nisso.

**Drift encontrado entre HTML e produção (29/07/2026):** durante a validação cruzada dos 3 lugares, `n8n-video-silence-cutter.html` estava com uma frase a menos ("LEMBRETE CRÍTICO: nenhum clipe pode ter (end - start) maior que 180 segundos...") no prompt do `Preparar GPT — Seleção Final`, presente em produção e em `workflow-blocos.json` mas nunca retroportada para o HTML. Corrigido junto com os 4 fixes acima — os três lugares foram validados byte-a-byte (harness Node executando o `buildBlockWorkflow()` do HTML e comparando o texto do prompt gerado, em ambos os casos `blockScoringFallback` true/false, contra o `jsCode` de `workflow-blocos.json`) e confirmados idênticos antes de aplicar em produção via MCP + `publish_workflow`.

**Ainda não testado com uma execução real após estes 4 fixes.**

**Bug crítico de sobreposição entre clipes corrigido (31/07/2026):** o snap de silêncio por clipe (início/fim ajustados de forma isolada por item do loop) podia consumir todo o gap mínimo entre 2 clipes e gerar sobreposição REAL de conteúdo — confirmado na execução #143 (clip2/clip3 com -2.46s de overlap). Corrigido com um clamp determinístico contra o vizinho + gap mínimo bruto subiu de 10s para 15s + tolerância do snap de início alargada + `real_start`/`real_end` agora persistidos no `_meta.json`. **MCP do n8n estava desconectado nesta sessão — só HTML e `workflow-blocos.json` foram atualizados, produção continua com o bug até reimportar manualmente.** Ver seção "Bug crítico corrigido — snap de silêncio por clipe podia gerar sobreposição" abaixo.

**Auditoria de timing dos cortes com agente "clipador" — bug de corte no meio do raciocínio confirmado como muito mais grave do que a documentação sugeria (29/07/2026):** criado um subagente dedicado (`.claude/agents/clipador.md`) para validar `start`/`end` de cada clipe já gerado contra o vídeo ORIGINAL, usando detecção de silêncio (`ffmpeg silencedetect`) em vez de transcrição (não há whisper local disponível). Rodada uma auditoria completa dos 113 clipes com `_meta.json` disponível (2 sem vídeo original localizável): **apenas 7% (8 clipes) têm início E fim limpos. 45% (51 clipes) foram cortados comprovadamente em cima de fala contínua** (nenhuma pausa detectável nem numa janela ampliada de ±6s, com threshold de ruído calibrado por vídeo — confirmado visualmente com extração de frame em 2 casos). Os outros 48% ficam "suspeitos" (existe uma pausa real próxima, mas não perfeitamente colada ao timestamp, tipicamente 1–6s de folga). Achados que contrariam a expectativa dos fixes de julho:
- **Início e fim falham em proporção parecida** (30 vs. 39 RUIM em 113) — a documentação atribuía o problema principalmente à extensão do `end` via `silencePrefix`, mas o `start` tem exatamente o mesmo padrão de falha.
- **Variação enorme por pregador/vídeo** (0% RUIM em alguns vídeos, até 86% RUIM em outros) — sugere que a cadência de fala do pregador específico pesa mais que qualquer parâmetro do pipeline.
- 0 violações de duração (35–180s) e gap mínimo (10s) — essas regras duras continuam sólidas.

**Causa raiz investigada em profundidade (mesmo dia) — revelou 2 bugs reais, não só uma hipótese de prompt:**
1. **O `silencePrefix` (extensão do `end` por silêncio) provavelmente nunca funcionou de verdade para boa parte dos vídeos**, pelo mesmo motivo já descoberto na calibração do agente clipador: o threshold hardcoded `-30dB` é sistematicamente mais rigoroso que o piso de ruído real de várias gravações (medido entre -13dB e -25dB em amostras reais, via `volumedetect`). Confirmado batendo a duração real de clipes já cortados (via `ffprobe`) contra `end - start` do `_meta.json`: em 3 amostras reais, a duração bate EXATAMENTE, ou seja, a extensão por silêncio não alterou o corte em nenhuma delas — evidência direta de que o mecanismo está silenciosamente inoperante na maioria dos casos, não só teoricamente arriscado.
2. **O `start` nunca teve NENHUM mecanismo de correção por silêncio** — só o `end` era estendido; o `start` sempre foi usado exatamente como a IA escolheu, sem nenhuma rede de segurança no código. Isso explica por que o início falha na mesma proporção que o fim.

Ver seção "Correção de timing — threshold dinâmico + snap simétrico de início/fim" abaixo para o fix aplicado.

**Auditoria completa de melhorias — performance, integração e qualidade (17/08/2026):** a pedido do usuário ("traga melhorias... tudo precisa passar pelo clipador para validar"), levantamento completo do pipeline com a parte de qualidade validada por dados reais do agente `clipador` em 24 clipes de 4 execuções (03–12/08/2026). Resultado agregado: 45.8% OK / 45.8% SUSPEITO / 8.3% RUIM, **zero overlap real entre clipes** (confirma que o fix de 31/07 funcionou), mas com uma lacuna residual identificada no clamp de colisão (compara só contra o valor bruto do vizinho, não o ajustado — 1 caso real ficou com gap de 4.74s, abaixo do piso de segurança de 5s). Também levantados: falta de `retryOnFail` nas 2 chamadas de IA e nas chamadas Graph API/FFmpeg, chave da OpenAI hardcoded em texto puro em vez de credential, ausência de `errorWorkflow`/notificação de conclusão. Ver seção "Auditoria completa de melhorias" abaixo para a lista completa. **Nada foi aplicado ainda — é só o levantamento, aguardando priorização do usuário.**

**Change OpenSpec `harden-block-pipeline-reliability` criada e implementada localmente (22/08/2026):** a auditoria de 17/08/2026 foi formalizada como uma change no OpenSpec (`openspec/changes/harden-block-pipeline-reliability/` — proposal, 3 specs novas: `pipeline-error-resilience`, `credential-security`, `clip-boundary-safety`, design.md, tasks.md) e os 3 blocos de fix foram implementados em `n8n-video-silence-cutter.html` e `workflow-blocos.json` (ainda **não aplicados em produção** — ver bloco seguinte):
1. **`retryOnFail` (5 tentativas, 5s de espera)** adicionado a `GPT — Analisar Blocos`, `GPT — Seleção Final`, `Resolver Pasta`, `Resolver Pasta Saída`, `Listar Arquivos`, `Listar Arquivos (Verificar Fila)`, `Mover Vídeo Processado` e `FFmpeg Cortar 9:16` — nenhum desses tinha retry antes, apesar de já existir precedente de timeout transitório real do OneDrive (08/07/2026).
2. **`onError: "continueRegularOutput"`** adicionado em todo node por-clipe dentro de `Loop Over Items` (corte FFmpeg, leituras/uploads, limpeza, e os 4 nodes do sub-pipeline de legenda dormente) — antes, uma falha em 1 clipe (ex: ffmpeg, upload) abortava a execução inteira e descartava os clipes seguintes que teriam funcionado normalmente.
3. **Chave da OpenAI migrada de header literal (`Bearer <key>` em texto puro) para a credential nativa OpenAI do n8n** nos dois nodes de IA (`makeAiNode`, engine `openai`): o header manual foi removido, os nodes agora usam `authentication:"predefinedCredentialType", nodeCredentialType:"openAiApi"` — mesmo padrão já usado pelos nodes do OneDrive neste workflow (`predefinedCredentialType`/`microsoftOneDriveOAuth2Api`). **Correção em relação ao design original:** a primeira versão desta change (design.md) tinha escolhido `HTTP Header Auth` (credential genérica) por engano, achando que a credential nativa OpenAI seria incompatível com o padrão `specifyBody:"keypair"` do body — na prática os dois são independentes (credential só controla o header, não o body), e o `get_node_types` do próprio node HTTP Request recomenda explicitamente preferir `predefinedCredentialType` quando o n8n já tem uma credential nativa para o serviço. O campo de UI "OpenAI API Key" no HTML foi desabilitado e seu hint atualizado explicando que a chave não é mais embutida no JSON gerado — precisa existir como credential OpenAI nativa no n8n (Credentials → Add Credential → OpenAI) antes de aplicar/publicar. **Engines Claude/Gemini não foram tocados** (não estão em uso, só Opção 3 com `openai` roda em produção).
4. **Fix do clamp de colisão residual** (o achado do gap de 4.74s da auditoria de 17/08): antes, o clamp de `ASTART` comparava só contra `prevClipEnd` BRUTO (a escolha original da IA para o vizinho anterior), nunca contra o `real_end` já ajustado dele — permitindo que os dois lados erodissem um em direção ao outro simultaneamente. Como `Loop Over Items` processa 1 clipe por vez sequencialmente, o `AEND` real do clipe anterior já é conhecido quando o clipe atual roda — o fix persiste esse valor num arquivo de estado simples (`/home/node/.n8n-files/.prev_clip_real_end`, sobrescrito a cada clipe, removido em `Limpar Vídeo Original`) e o clamp do próximo clipe lê esse valor real em vez do bruto precomputado (fallback pro bruto se o arquivo não existir ou for o primeiro clipe da execução). **Limitação aceita conscientemente:** o sentido "para frente" (contra o próximo vizinho, `NEXTSTART`) continua usando o valor bruto — o ajuste do próximo clipe ainda não aconteceu quando o clipe atual roda, então esse lado da erosão não foi fechado 100%, só o lado "para trás" (já processado). Ver `design.md` da change para os detalhes completos e as alternativas descartadas (ex: 2 passes separados, rejeitada por complexidade desproporcional ao achado).

Validado localmente antes de tocar produção: harness Node (`vm.createContext` executando `buildBlockWorkflow()` com defaults de produção) confirmou os 4 fixes em todos os nodes tocados; `sh -n` e `new Function()` validaram sintaxe de bash/JS de todos os nodes editados; simulação numérica reproduzindo o caso real da auditoria (Pr. Hiro Delgado, clip4→clip5) confirmou que o clamp antigo aceitava um gap real de 2.5s (abaixo do piso de 5s) e o clamp novo corretamente rejeita esse ajuste, mantendo 5.24s. `workflow-blocos.json` foi repatchado cirurgicamente (16 nodes substituídos, diff mínimo, 37/37 nodes preservados, JSON válido).

**Pré-requisito da credential resolvido (22/08/2026, mesmo dia):** o usuário criou a credential nativa "OpenAI account" (`openAiApi`, id `Nbuq36KrXwL1exNW`) via UI do n8n. Grupo de tarefas 7 (aplicar via MCP) pode prosseguir.

**Correção de design aplicada antes de tocar produção (22/08/2026):** ao montar as operações do grupo 7, o `get_node_types` do node HTTP Request revelou que o design original (credential genérica `HTTP Header Auth`) estava errado — o builder hint do próprio node recomenda `predefinedCredentialType` sempre que o n8n já tem uma credential nativa para o serviço (mesmo padrão já usado pelos nodes do OneDrive), e isso independe de como o body é montado (a suposição de incompatibilidade com `specifyBody:"keypair"` era falsa — os dois são concerns independentes). Design corrigido para usar `authentication:"predefinedCredentialType", nodeCredentialType:"openAiApi"`, reaproveitando a credential nativa que o usuário já tinha criado.

**Aplicado em produção com sucesso (22/08/2026):** os 21 operações (`setNodeSettings` para retry/onError, `updateNodeParameters` para credential/clamp, `setNodeCredential` nos 2 nodes de IA) foram aplicadas atomicamente via `update_workflow` e publicadas (`activeVersionId: 667ecdd3-749d-47ee-8dd7-28f5d8b3177f`). Confirmado pós-publish que os 16 nodes tocados batem byte-a-byte com `workflow-blocos.json` (retry/maxTries/waitBetweenTries/onError, auth/credential type, e comandos idênticos em `FFmpeg Cortar 9:16`/`Limpar Vídeo Original`). A chave em texto puro (visível brevemente no `get_workflow_details` pré-mudança, já documentada como exposta desde antes desta sessão) foi removida do `headerParameters` — nenhuma cópia foi persistida em arquivo durante o processo.

**Achado colateral — trava órfã encontrada e liberada (22/08/2026):** logo após o publish, uma execução manual do usuário (#244) esbarrou numa trava presa desde as 10:00 UTC (~6.3h), apontando para um arquivo **"nos.mp4"** (9.6MB, não é conteúdo de pregação) que estava solto na raiz de `Videos-Cortes`. A execução real que pegou esse arquivo (#242, 10:00 UTC, ANTES desta mudança) rodou corretamente — a IA classificou certo que nenhum bloco era `fase:"pregacao"` — mas o `throw` correspondente em "Ranking dos Blocos" acontece antes de "Limpar Vídeo Original" (o node que libera a trava), deixando-a presa até a expiração de 8h. **Não relacionado a este change** — é a limitação já documentada ("a trava só é liberada no caminho de sucesso"), só que desta vez com impacto real observado. Liberado manualmimente via a técnica de node temporário (`TEMP Limpar Trava`, Execute Command `rm -f .processing.lock`, conectado a "Iniciar Manualmente", executado, depois removido e republicado). Fila agora tem 2 vídeos elegíveis. O arquivo "nos.mp4" já não aparece mais na listagem mais recente — presumivelmente removido/movido pelo usuário.

**Primeira execução real pós-deploy (#246) — credential validada, clamp ainda não testado (22/08/2026):** execução real disparada no vídeo "Não saia da presença! || Culto Ao Vivo - Pr. Daniel dos Santos 16/08/2026" (5661s/~94min). Rodou por completo até `GPT — Analisar Blocos` — **confirma que a credential nativa OpenAI funciona em produção** (teria falhado ali se a autenticação estivesse quebrada). Mas terminou no próprio caminho de erro esperado do pipeline em "Ranking dos Blocos": os 9 blocos (cobrindo o vídeo inteiro) vieram classificados como louvor/avisos/dizimo_oferta/encerramento, **zero como pregação** — não é regressão desta change, é o filtro de fase funcionando como projetado num culto aparentemente atípico (menções a "apoio a candidatos e autoridades", homenagens — sugere evento especial, não pregação padrão). 2 blocos (5 e 7) tinham desenvolvimento real de mensagem "contaminado" pelas bordas de louvor/oração, e a IA seguiu a instrução "na dúvida, prefira a nota baixa" à risca. **A execução nunca chegou em `FFmpeg Cortar 9:16`, então o fix do clamp de colisão continua sem validação real.**

A trava ficou órfã de novo (mesmo padrão — erro antes de "Limpar Vídeo Original"), liberada com a mesma técnica, desta vez desconectando temporariamente "Iniciar Manualmente"→"Resolver Pasta" antes de rodar o node de limpeza isolado (para não disparar o pipeline inteiro de novo por engano) — o classificador de permissões do Claude Code bloqueou as duas primeiras tentativas de `removeConnection`/`removeNode` por mutações estruturais consecutivas em produção, exigindo autorização explícita do usuário antes de prosseguir. Fila agora tem 1 vídeo elegível restante ("Se posicione diante do problema... Miss. Geovania Soares").

**Pendência real do grupo 8:** falta uma execução que produza clipes de verdade (chegue em `FFmpeg Cortar 9:16`) para validar o fix do clamp de colisão end-to-end com o agente `clipador`.

**Bug encontrado — bloco gigante + exclusão categórica de fase descarta pregação real (execução #246, 22/08/2026):** investigação a pedido do usuário ("precisa avaliar porque não teve corte") sobre por que a execução #246 não gerou nenhum clipe revelou que **não é um caso de conteúdo atípico** (como a hipótese inicial sugeria) — é um bug real de interação entre dois mecanismos já existentes:

1. **"Dividir em Blocos" produziu blocos muito maiores que os ~3min de design** (fala contínua sem pausas ≥0.5s, mesmo padrão já documentado em 09/07/2026): dos 9 blocos do vídeo (5661s/~94min), 3 tinham 18–24 minutos cada (blocos 2, 5, 7).
2. **Inspecionado o texto bruto dos blocos 5 e 7** (via `Dividir em Blocos` na execução salva): ambos continham pregação real e substancial — bloco 5 tem a parábola do filho pródigo completa, aplicada a abandono/restauração, entre um apelo de dízimo no início e uma oração de conversão no fim; bloco 7 contém o sermão "Não saia da presença de Deus" (Romanos 8) — **o próprio tema que dá título ao vídeo** — seguido de um louvor longo no final.
3. A IA (`GPT — Analisar Blocos`) classificou os dois blocos INTEIROS como `dizimo_oferta` e `louvor` respectivamente, mesmo reconhecendo explicitamente no `reason` que havia pregação real ali ("a pregação só começa no final", "embora contenha desenvolvimento da mensagem... contaminando a seleção") — a regra "na dúvida, prefira a nota baixa" do filtro de fase (12/07/2026) tratou o bloco inteiro pela borda, não pelo conteúdo predominante.
4. Isso não é só uma nota baixa: o código em "Ranking dos Blocos" força `score=0` para `fase != "pregacao"` de forma **categórica e determinística** (13/07/2026, salvaguarda contra a IA não respeitar o teto numérico). Como isso zerou os 9 de 9 blocos, nenhum se qualificou como `fase:"pregacao"` nem para o fallback — e a 2ª IA (`Seleção Final`), que recebe a transcrição **completa** e poderia ter encontrado esses trechos de qualquer forma, nunca chegou a rodar.

~~Fora do escopo de `harden-block-pipeline-reliability`~~ — **fix aplicado mesmo assim, a pedido explícito do usuário (22/08/2026, "pode parar e fazer os ajustes e validações")**, fora do escopo formal da change (que só cobria retry/credential/clamp), mas no mesmo fluxo de trabalho. Implementada a opção (b) das duas direções cogitadas: **"Ranking dos Blocos" nunca mais aborta a execução por zero blocos `fase:"pregacao"`** — antes, esse caso lançava `throw new Error(...)` direto; agora entra no mesmo caminho de fallback já existente (usado quando blocos de pregação têm nota baixa), só que com `qualified = []` e uma mensagem de razão própria. A 2ª IA (`Preparar GPT — Seleção Final`) sempre recebeu a transcrição SRT **completa** independente do resultado da triagem — ela só não tinha chance de rodar quando a 1ª IA classificava tudo como não-pregação. Mudanças:
1. **`Ranking dos Blocos`**: removido o `throw` para o caso "0 blocos pregacao"; em vez disso, `usedFallback=true` com `qualified=[]` (nenhum bloco em destaque) e uma `fallbackReason` explicando a causa provável (blocos longos misturando pregação real com bordas de dízimo/louvor).
2. **`Preparar GPT — Seleção Final`**: o texto do aviso de fallback agora se ramifica em dois casos — quando existem blocos-candidato (`hasTopBlocks`, comportamento antigo preservado) vs. quando `topBlocksSummary` vem vazio (novo texto "AVISO CRÍTICO", explicando o problema de blocos gigantes + classificação categórica e pedindo para a IA ignorar completamente a triagem anterior). A seção "Melhores blocos" do prompt só aparece quando há blocos reais — evita um cabeçalho vazio confuso.
3. **`Montar Clipes` continua sendo a rede de segurança final** — se mesmo com acesso à transcrição completa a 2ª IA não retornar nenhum clipe válido, o throw já existente ali (com diagnóstico específico) ainda protege contra uma execução silenciosamente vazia.

Validado localmente antes de aplicar: harness Node simulando a resposta REAL da IA da execução #246 (9 blocos, 0 `pregacao`) confirmou que "Ranking dos Blocos" não lança mais exceção (`blockScoringFallback:true`, `topBlocksSummary:""`); simulação do prompt da 2ª IA confirmou que o texto "AVISO CRÍTICO" aparece corretamente nesse caso, e que os casos normal e de fallback-parcial (já existentes) não tiveram nenhuma regressão. Aplicado em produção via MCP (`updateNodeParameters` nos 2 nodes, `replace:true`) enquanto a execução #250 ainda rodava — seguro porque ela ainda não tinha chegado nesses nodes (estava no whisper.cpp) e a mudança foi só de parâmetro, não estrutural (sem `addNode`/`removeNode` no meio da execução). Publicado e reconferido byte-a-byte contra `workflow-blocos.json` (`activeVersionId: 18c325de-d7c4-412d-b512-0633d5225903`). **Ainda não validado com uma execução real que de fato passe por esse caminho** — a validação viria naturalmente se a execução #250 (ou uma futura) cair no cenário de zero blocos pregação.

Direção (a) da lista original (subdividir blocos muito longos antes da classificação de fase) continua não implementada — permanece como possível melhoria futura, mas a opção (b) já fecha a lacuna mais grave (perda total do vídeo), mesmo sem resolver a granularidade da triagem em si.

---

## Arquitetura: 3 opções de workflow

| Opção | Nome | Pipeline | Status |
|-------|------|----------|--------|
| **Opção 1** | Semântico | whisper.cpp → IA → Montar Clipes → FFmpeg | Não usada |
| **Opção 2** | Simples | FFmpeg `silencedetect` only, sem IA | Não usada |
| **Opção 3** | Blocos (2 passes) | whisper.cpp → IA score blocos 3min → IA seleção final → Montar Clipes → FFmpeg | **Em uso** |

As 3 opções são geradas por funções separadas no `<script>`: `buildSimpleWorkflow()`, `buildSemanticWorkflow()`, `buildBlockWorkflow()`.

---

## Estrutura do código (dentro do `<script>`)

```
cfg {}                        ← configuração do usuário (lida do HTML pelo updateCfg())
buildSimpleWorkflow()         ← Opção 2 (não usada)
buildSemanticWorkflow()       ← Opção 1 (não usada)
buildBlockWorkflow()          ← Opção 3 (EM USO)
```

Cada função monta um array `nodes[]` e retorna o JSON do workflow n8n.

### Parâmetros de cfg relevantes

| Variável | Default | Descrição |
|----------|---------|-----------|
| `cfg.minClip` (`MIN`) | 30 | Duração mínima do clipe (s) |
| `cfg.maxClip` (`MAX`) | 70 | Duração alvo/preferida do clipe (s) — usada nos prompts de IA |
| `cfg.minBlockScore` | 70 | Score mínimo para bloco passar na Opção 3 (40–55 para sermões lentos) |
| `cfg.noiseDb` | -30 | Threshold de ruído para `silencedetect` (dB) |
| `cfg.minSilence` | 0.4 | Duração mínima de silêncio detectado (s) |
| `cfg.margin` | 0.15 | Margem de segurança nos cortes (s) |

**Engine padrão:** `openai` (pré-selecionado na UI). Modelo: `gpt-5.6-luna` (trocado de `gpt-5.4-mini` em 29/07/2026, a pedido do usuário — aplicado nos três lugares: n8n via MCP, HTML, `workflow-blocos.json`; ainda não testado com uma execução real). **Chave via credential nativa OpenAI do n8n (`openAiApi`, desde 22/08/2026, change `harden-block-pipeline-reliability`)** — o campo `openai-key` do HTML está desabilitado/informativo; a chave real vive só na credential do n8n ("OpenAI account", id `Nbuq36KrXwL1exNW`), nunca no JSON do workflow.

**VPS (atualizado 06/07/2026):** upgrade para 6 núcleos / 18GB RAM. Mudanças aplicadas no whisper.cpp em função disso:
- Modelo trocado de `ggml-small.bin` para `ggml-large-v3.bin` (~4-5GB RAM, cabe com folga nos 18GB) — maior precisão de transcrição, o que ajuda também o bug de cortes mid-reasoning (menos erros de reconhecimento = pontos de pausa mais confiáveis no PASSO 0/1).
- Flag `-t 6` adicionada às duas chamadas de whisper.cpp (transcrição completa e transcrição por clipe) — antes rodava sem flag de threads (default do whisper.cpp, tipicamente 4), deixando 2 núcleos ociosos.
- FFmpeg não precisou de ajuste: já detecta e usa todos os núcleos disponíveis automaticamente (sem flag `-threads` explícita no código).
- **Pré-requisito no servidor:** o arquivo `ggml-large-v3.bin` precisa existir em `/models/` na VPS antes de rodar — se não tiver sido baixado ainda, o comando `whisper` vai falhar com "model not found". Baixar de https://huggingface.co/ggerganov/whisper.cpp/tree/main (ou via `bash models/download-ggml-model.sh large-v3` no repo do whisper.cpp).
- Impacto esperado no tempo de transcrição: `large-v3` é mais lento que `small` por natureza (modelo maior), mas com 6 threads dedicados o tempo total deve ficar próximo ou melhor que o `small` rodando sem `-t` antes.

---

## Bug pendente — cortes no meio do raciocínio

**Problema confirmado em produção (julho/2026):** ao assistir os clipes gerados, os cortes acontecem no meio de um raciocínio em andamento. O pregador faz uma pausa breve (respiração, ênfase) e o clipe termina ali, mesmo que o pensamento não esteja concluído.

**Causa raiz:**
1. whisper.cpp segmenta o áudio em blocos de 3–10s, colocando quebras nos gaps de áudio — inclusive pausas de respiração de 0.1–0.3s
2. O PASSO 1 pede "pontos de conclusão", mas a IA tende a usar as quebras de segmento SRT (que parecem conclusões visualmente no texto) como proxy
3. Sem pontuação na transcrição, a IA não consegue distinguir "pausa entre vírgulas" de "pausa entre parágrafos"
4. O `silencePrefix` FFmpeg estende o END até o próximo silêncio de 0.3s — mas se o pregador só fez uma pausa de respiro, o corte continua errado (só é deslocado alguns frames)

**O que já foi tentado sem sucesso:**
- PASSO 1 com instrução de "15–25 pontos de conclusão real" — a IA ainda escolhe pausas de respiro
- Instrução de "NUNCA em enumeração, vírgula ou conjunção" — não resolve sem pontuação real
- `silencePrefix` com `duration=0.3` e janela de 92s — estende o end, mas não corrige o ponto errado

**Fix implementado em 06/07/2026 — PASSO 0 (abordagem #1 escolhida):**

Em vez de pedir para a IA calcular gaps manualmente a partir do texto SRT bruto (frágil — a IA lê números, não faz aritmética confiável em contexto longo), o pré-processamento agora acontece em código, antes de qualquer IA ver a transcrição:

- Novo Code node **"Mesclar Pausas Curtas"**, inserido entre `Whisper.cpp Transcrever` e `Dividir em Blocos`.
- Lê o SRT bruto, calcula o gap entre o fim de cada bloco e o início do próximo. Se `gap < 0.5s` (respiração), mescla os dois blocos em um só (concatena texto, estende o fim). Se `gap >= 0.5s`, mantém como blocos separados.
- Resultado: o SRT que chega ao PASSO 1/PASSO 2 (`sysFinal`) só tem quebras de bloco onde já existe uma pausa real (≥0.5s) — **por construção**, não por instrução de prompt.
- O prompt `sysFinal` (PASSO 1) foi reescrito para informar a IA que o SRT já vem pré-processado: ela não precisa mais calcular gaps, só decidir se o fim de um bloco também fecha um raciocínio (ainda existem pausas reais no meio de enumerações/vírgulas faladas, então esse filtro semântico continua necessário).
- Testado localmente com SRT simulado (respirações de 0.15–0.2s + pausas reais de 0.8–0.9s): merge funcionou corretamente, preservando as pausas reais como limites de bloco e absorvendo as respirações no texto do bloco anterior.
- JSON gerado e sintaxe de todos os Code nodes validada com harness Node (fora do browser) antes da entrega.

**Ainda não testado com vídeo real** — validar no próximo run se os cortes mid-reasoning realmente desaparecem. Se persistir, seguir para as abordagens #2 e #3 abaixo.

**Novo bug encontrado no primeiro teste pós-fix (06/07/2026):** o "Montar Clipes" retornou vazio sem nenhum erro visível. Resposta bruta do `GPT — Seleção Final` continha 6 clipes válidos, mas todos com timestamps concentrados entre 6.2 e 62.5 (unidade ambígua) — ao aplicar a salvaguarda ×60 (trata como minutos decimais), as durações resultantes ficaram entre 270–708s, todas acima do teto de 180s, e o filtro descartou os 6 silenciosamente. Causa provável: a IA não espalhou os pontos de conclusão do PASSO 1 ao longo de todo o vídeo — se comportou como se só tivesse lido um trecho pequeno perto do início.

**Dois fixes aplicados nesta rodada:**
1. **Âncora de duração no prompt:** o `userContent` enviado ao `GPT — Seleção Final` agora começa com "DURAÇÃO TOTAL DO VÍDEO: X segundos (~Y minutos)" e instrui explicitamente a IA a distribuir os pontos de conclusão por todo esse intervalo, não só no início. Reforço equivalente adicionado ao PASSO 1 do `sysFinal`.
2. **Erro explícito no "Montar Clipes":** quando `results.length === 0`, o node agora lança um `throw new Error(...)` com os clipes brutos retornados pela IA (start/end/duração) e a duração real do vídeo — em vez de retornar `[]` silenciosamente. Isso torna o problema visível na execução do n8n com dados suficientes para diagnosticar na hora.

**Nova evidência real (07/07/2026) — a âncora de duração sozinha NÃO foi suficiente:** com o throw explícito em produção, apareceu um novo caso real: a IA retornou 8 clipes válidos (nenhum problema de unidade — a salvaguarda ×60 corretamente NÃO disparou), mas todos os 8 clipes estavam concentrados nos primeiros **132.6 segundos de um vídeo de 2529.6s** (42 minutos). Ou seja, a IA leu só ~5% do vídeo e nem tentou cobrir o resto, apesar da instrução textual "distribua ao longo de todo o vídeo, não concentre no início" já estar no prompt. Isso confirma que o problema é um viés de atenção da IA em transcrições longas (ela tende a "esgotar" o orçamento de raciocínio nos primeiros parágrafos do texto), não um bug de unidades — instrução solta em prosa não é suficiente para forçar cobertura.

**Fix mais forte aplicado em 07/07/2026 — checklist obrigatório de janelas de tempo:**

Em vez de pedir "distribua ao longo do vídeo" em prosa (que a IA ignorou), o `userContent` agora **calcula programaticamente** (em JS, não em prompt) `N_BUCKETS = 6` janelas de tempo iguais cobrindo a duração total do vídeo, e apresenta um checklist explícito no início da mensagem do tipo:

```
CHECKLIST OBRIGATÓRIO DE COBERTURA: o vídeo foi dividido em 6 janelas de tempo iguais.
Antes de finalizar o PASSO 1, você DEVE ter pelo menos 2 pontos de conclusão em CADA
uma das janelas abaixo. Se alguma janela estiver vazia, volte e releia essa parte da
transcrição SRT completa antes de responder — isso não é opcional:
1. 0s–421s — pelo menos 2 pontos de conclusão aqui
2. 421s–843s — pelo menos 2 pontos de conclusão aqui
... (6 janelas)
```

Mudanças no `sys` do `Preparar GPT — Seleção Final`:
- PASSO 1 agora referencia explicitamente o checklist e instrui a IA a "PARAR e reler o restante da transcrição" se notar que todos os pontos estão numa janela pequena — não é mais uma sugestão, é uma instrução de fluxo (stop-and-check).
- PASSO 2 ganhou uma nova regra (e): os clipes finais devem vir de **pelo menos 4 janelas diferentes** do checklist — não apenas ter pontos de conclusão espalhados, mas também garantir que os clipes *selecionados* não fiquem todos amontoados no início.
- REGRAS INEGOCIÁVEIS ganhou uma linha explícita reforçando a obrigatoriedade do checklist.

O número de janelas (`N_BUCKETS = 6`) e o tamanho de cada uma são calculados dinamicamente a partir de `$json.duration` — funciona igual para um vídeo de 10 minutos ou de 2 horas, sempre dividindo em 6 partes iguais.

**Aplicado em três lugares nesta sessão:** (1) diretamente no workflow do n8n via MCP (`ID4wisnN4Tqpt2zh`, node "Preparar GPT — Seleção Final", operação `updateNodeParameters`), (2) em `n8n-video-silence-cutter.html` (função `buildBlockWorkflow`, dentro do `userExpr` passado para `makeAiNode` do node final), (3) em `workflow-blocos.json` (JSON estático, mesmo conteúdo do node atualizado).

**Ainda não testado com vídeo real.** Validar no próximo run se os 8 clipes (ou quantos forem retornados) agora cobrem pelo menos 4 das 6 janelas do vídeo.

**Abordagens que ainda podem ser exploradas se o checklist de janelas não for suficiente:**

2. ~~Instrução explícita de gap SRT no PASSO 1~~ — superada pelo PASSO 0 (a IA não precisa mais calcular gaps).

3. **PASSO 3 — verificação de cada clip END:** após selecionar os clipes, a IA verifica cada `end` perguntando "o que vem imediatamente depois deste timestamp? Se é continuação do mesmo raciocínio, avance o end para o próximo ponto de conclusão do PASSO 1."

4. **Aumentar `duration` do whisper.cpp** de 0.3s para 0.8s no silencedetect do silencePrefix — menos extensões falsas.

5. **Dividir a chamada final em N sub-chamadas por janela** (uma chamada de IA por bucket de tempo, cada uma vendo só o trecho do SRT daquela janela) — mais caro (mais chamadas de API) mas elimina de vez o viés de atenção, pois a IA fisicamente não teria acesso ao resto do texto para "esquecer". Só vale a pena explorar se o checklist de janelas (fix atual) ainda falhar.

---

## minBlockScore reduzido de 70 para 40 (09/07/2026)

**Contexto:** após o fix do arquivo 0 bytes (ver seção abaixo), o vídeo "Fique Atento à Oportunidade || Culto Ao Vivo - 30/06/2026" baixou e processou corretamente (824MB, 45:53min, 4K/AV01), mas o pipeline parou no "Ranking dos Blocos" com `Nenhum bloco atingiu nota minima de 70. Notas: 8:57, 1:52, 7:44, 6:10, 2:9, 3:9, 4:9, 5:9`.

**Validação do vídeo vs. o erro:** diagnosticado via `get_execution` (nodes "GPT — Analisar Blocos" e "Dividir em Blocos"). O vídeo é um **culto ao vivo completo** (45:53min), não um recorte de pregação isolado. Os 8 blocos e seus horários:

| Bloco | Intervalo | Score | Conteúdo (segundo a razão da IA) |
|-------|-----------|-------|-----------------------------------|
| 1 | 0:00–5:53 | 52 | Leitura bíblica + louvor |
| 2 | 5:53–8:53 | 9 | "Extremamente repetitivo, sem gancho novo" |
| 3 | 8:53–11:53 | 9 | Mesma repetição |
| 4 | 11:53–14:53 | 9 | Mesma repetição |
| 5 | 14:53–18:23 | 9 | Mesma repetição |
| 6 | 18:23–21:23 | 10 | Repetitivo, mas já aponta para o tema de Bartimeu |
| 7 | 21:23–25:57 | 44 | Clamor, repreensão, revelação de Jesus como Rei da Glória |
| 8 | 25:57–45:53 | 57 | Parte mais forte: confronto, urgência, aplicação prática |

Os primeiros ~21 minutos (blocos 1–6) são leitura bíblica + um trecho longo e altamente repetitivo (provável clamor/declaração repetida em estilo de guerra espiritual referenciando Bartimeu) — pouco aproveitável para Shorts, e a IA pontuou isso corretamente perto de zero. Só os últimos ~24 minutos (blocos 7–8) têm conteúdo de ensino de fato, mas mesmo assim ficaram abaixo do limiar de 70 (`minBlockScore` default). **Conclusão: não é um bug — a IA avaliou o conteúdo corretamente, mas o threshold de 70 é alto demais para o perfil típico dos vídeos deste projeto (cultos completos, não só pregações isoladas).**

**Observação secundária (não corrigida, só registrada):** o bloco 8 tem duração de quase 20 minutos (1557–2753s) em vez do alvo de ~3min — provavelmente porque, nesse trecho, o pregador fala quase sem pausas ≥0.5s, então o PASSO 0 ("Mesclar Pausas Curtas") e a lógica de `Dividir em Blocos` (`seg.e - bs >= BLOCK`) acabam produzindo um único bloco gigante em vez de vários blocos de 3min. Isso reduz a granularidade da pontuação nessa região, mas não impede a 2ª IA de escolher pontos de corte precisos dentro do bloco (ela recebe o SRT completo, não só o resumo do bloco). Vale observar se isso se repete em outros vídeos com estilo de fala mais contínuo.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`), com confirmação explícita do usuário:** `minBlockScore` default baixado de **70 para 40**. Isso agora deixa passar blocos como o 7 (44) e o 8 (57) para o 2º passo de seleção final, em vez de travar o pipeline inteiro. Esse novo default vale para todos os vídeos processados a partir de agora, não só este — o usuário escolheu essa opção sabendo que já era a recomendação documentada anteriormente ("reduza para 40–55 em sermões, palestras ou narração lenta") e decidiu torná-la o padrão em vez de um ajuste manual por vídeo.

**Ainda não testado com uma reexecução real após a mudança de threshold** — falta confirmar se os blocos 7–8 realmente produzem clipes finais de boa qualidade quando alimentados à 2ª IA.

---

## Bug corrigido — teto de 180s ignorado pela IA (12/07/2026)

**Sintoma:** o node "Montar Clipes" travou com zero clipes aprovados, throw de erro, para o vídeo "Não é o Fim, é o Crescimento || Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano" (7725.05s / ~128:45min). A mensagem de erro da época (genérica) dizia como causa provável "a IA concentrou os pontos de conclusao numa janela pequena... ou os timestamps nao estao no formato esperado" — nenhuma das duas era a causa real.

**Diagnóstico:** via `get_execution` na execução, os 8 clipes brutos retornados pela IA (em segundos, já corretos) eram:

| Clipe | Start | End | Duração |
|-------|-------|-----|---------|
| 1 | 49.44 | 341.72 | 292s |
| 2 | 230.00 | 545.80 | 316s |
| 3 | 3557.40 | 3860.00 | 303s |
| 4 | 3868.00 | 4100.00 | 232s |
| 5 | 4180.00 | 4460.00 | 280s |
| 6 | 4468.00 | 4750.00 | 282s |
| 7 | 4758.00 | 5010.00 | 252s |
| 8 | 5819.00 | 6201.00 | 382s |

Os timestamps estavam corretos (em segundos totais, sem erro de unidade) e razoavelmente bem distribuídos ao longo do vídeo (0 a 6201s, ~80% da duração total) — ou seja, **não havia bug de clustering nem de formato**. A causa real: todas as 8 durações (232–382s) excedem o filtro `dur > 180` do código em "Montar Clipes", que descarta silenciosamente qualquer clipe acima de 180s (3 minutos, teto técnico do YouTube Shorts). Nenhum clipe sobrou → `results.length === 0` → throw.

**Causa raiz — mismatch entre prompt e código:** o prompt `sysFinal` (node "Preparar GPT — Seleção Final") dizia explicitamente à IA, na regra de DURAÇÃO IDEAL e na regra (b) do PASSO 2: *"se o raciocínio não couber em 70s, avance o 'end' até completar o pensamento — **sem limite rígido: capture o raciocínio completo**"*. Ou seja, o próprio prompt instruía a IA a ignorar qualquer teto de duração, enquanto o código sempre teve um teto rígido de 180s. A IA fez exatamente o que foi instruída — seguiu o raciocínio do pregador até a conclusão natural, sem se preocupar com 180s, porque ninguém tinha dito a ela que esse limite existia.

**Por que não apareceu antes:** vídeos mais curtos ou com pregadores que fazem pausas de conclusão mais frequentes tendem a gerar naturalmente clipes abaixo de 180s, mesmo sem a IA saber do teto. Esse vídeo específico (Pr. Rodnei Romano) parece ter blocos de raciocínio mais longos e contínuos, expondo o mismatch que já existia silenciosamente no prompt desde antes desta sessão.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**
1. **Prompt `sysFinal` reescrito** em três pontos: (a) regra 6 DURAÇÃO IDEAL agora informa o "TETO ABSOLUTO E INEGOCIÁVEL: 180 segundos" e instrui a IA a escolher um ponto de conclusão intermediário real dentro do teto quando o raciocínio completo for mais longo, em vez de tentar capturar tudo; (b) PASSO 1 ganhou uma instrução para procurar ativamente por pontos de conclusão intermediários a cada 40–180s (não só no fechamento final do argumento), garantindo que sempre exista uma opção de `end` válida dentro do teto; (c) PASSO 2 regra (b) agora diz que o `end` deve cair "ENTRE start+40s E start+180s (nunca antes, nunca depois)", e regra (c) foi reforçada para nunca escolher um `end` acima de start+180s; (d) REGRAS INEGOCIÁVEIS ganhou uma linha dedicada e explícita sobre o teto de 180s.
2. **Mensagem de erro do "Montar Clipes" melhorada:** antes, o throw sempre citava o mesmo texto genérico ("concentrou numa janela pequena ou formato errado"), mesmo quando a causa real era outra. Agora o código calcula, a partir dos clipes brutos retornados pela IA: quantos excedem 180s, quantos ficam abaixo da duração mínima, se os timestamps parecem estar em minutos (salvaguarda ×60), e o intervalo (span) coberto pelos clipes — e escolhe a mensagem de "causa provável" que efetivamente bate com os dados daquela execução, em vez de um texto fixo. Isso deve tornar diagnósticos futuros mais rápidos (esta investigação levou vários passos de `get_execution` + cálculo manual para chegar à causa real).

**Ainda não testado com uma reexecução real após o fix** — falta rodar novamente o vídeo do Pr. Rodnei Romano (ou outro com raciocínios longos) para confirmar que a IA agora respeita o teto de 180s e que os clipes finais capturam pontos de conclusão intermediários coerentes (não cortados no meio de uma frase).

---

## Filtro de fase do culto — abertura/dízimo/avisos excluídos (12/07/2026)

**Pedido do usuário:** "ignorar a abertura do culto, dízimo e oferta e apresentação, pegar somente a palavra para gerar os cortes." Até esse momento, os prompts de IA (`sysAnalise` e `sysFinal`) avaliavam qualquer trecho do vídeo pelos 7 critérios de retenção (gancho, emoção, ritmo, etc.) sem nenhuma distinção estrutural entre as fases do culto — um trecho de abertura empolgado ("bom dia, igreja!!") ou um apelo de dízimo com linguagem emocional forte ("Deus tem sido fiel, separe sua oferta com fé") poderia, em tese, pontuar bem nos critérios de emoção/impacto e acabar virando Short, mesmo não sendo pregação.

**Por que isso não apareceu como bug antes:** os vídeos processados até agora provavelmente tinham blocos de abertura/avisos/dízimo com pontuação naturalmente baixa (pouco gancho, ritmo de fala diferente da pregação) e ficaram abaixo do `minBlockScore`. Mas isso era um efeito colateral do scoring genérico, não uma regra explícita — o risco de um trecho desses "passar" sempre existiu, e o usuário decidiu eliminar essa ambiguidade de forma estrutural em vez de confiar no scoring genérico.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**

1. **`sysAnalise`** (node "Preparar GPT — Analisar Blocos", 1º passe que pontua blocos de ~3min): ganhou uma **REGRA DE EXCLUSÃO OBRIGATÓRIA** no topo do prompt, aplicada ANTES de qualquer nota pelos 7 critérios normais. A IA agora recebe uma lista explícita das 4 fases não-pregação (abertura/boas-vindas, avisos/recados, apelo de dízimos e ofertas, louvor/música) com exemplos de frases típicas de cada uma, e deve atribuir nota máxima de **5** a qualquer bloco que pertença a uma delas — independentemente de quão emocionante o texto pareça. Os 7 critérios de retenção (gancho, emoção, ritmo etc.) só se aplicam normalmente a blocos que a IA classificar como pregação. O prompt reforça: "na dúvida, prefira a nota baixa — é melhor descartar um bloco de pregação ambíguo do que deixar passar abertura/dízimo/avisos/louvor."
   - O JSON de resposta ganhou um campo novo, **`"fase"`**, com valores possíveis `"pregacao"`, `"abertura"`, `"avisos"`, `"dizimo_oferta"` ou `"louvor"` — não é usado pelo código (`Ranking dos Blocos` continua filtrando só por `score >= minBlockScore`), mas fica disponível nos dados da execução para facilitar diagnóstico futuro (dá para ver no `get_execution` exatamente qual fase a IA atribuiu a cada bloco, sem precisar reler o texto inteiro).

2. **`sysFinal`** (node "Preparar GPT — Seleção Final", 2º passe que escolhe os clipes finais): ganhou duas reforços, já que este passe recebe a transcrição SRT **completa** (não só os blocos aprovados) e por isso pode, em teoria, escolher um `start`/`end` que caia numa borda de abertura/avisos/dízimo mesmo que o bloco pai tenha sido classificado como pregação (blocos são fatias de ~3min, então um bloco de pregação pode ter alguns segundos de transição no início/fim que ainda pertencem à fase anterior):
   - A frase de abertura do prompt agora avisa que os blocos recebidos já vêm filtrados, mas que a IA deve continuar vigilante se qualquer trecho da transcrição completa pertencer a abertura/avisos/dízimo/louvor — nesse caso, nunca selecionar um clipe dali.
   - REGRAS INEGOCIÁVEIS ganhou uma linha dedicada: nenhum clipe pode vir dessas 4 fases, e se um ponto de conclusão do PASSO 1 cair dentro de um desses trechos, deve ser descartado.

**Por que não foi criado um filtro em código (Code node) em vez de depender só do prompt:** ao contrário do teto de 180s (que é um número objetivo, fácil de validar programaticamente com `dur > 180`), decidir se um trecho é "abertura", "dízimo" ou "pregação" é uma tarefa de compreensão de linguagem natural — não dá para escrever uma regex ou checar um número para isso de forma confiável. Por isso o filtro fica inteiramente a cargo da IA nos dois passes (com reforço redundante no 2º passe como camada de segurança), em vez de uma validação determinística no `Montar Clipes` como acontece com duração/gap/formato de timestamp.

**Validado com execução real — ver seção "Validação do filtro de fase — execução #25 vs #26" abaixo.**

---

## Filtro de fase — "encerramento do culto" adicionado como 5ª fase excluída (29/07/2026)

**Pedido do usuário:** "não gerar corte do louvor, oferta ou dízimos e encerramento do culto." Louvor e dízimo/oferta já estavam cobertos pelo filtro de 12/07/2026 (ver seção acima) — a lacuna real era **"encerramento do culto"** (oração final, bênção, despedida), uma 5ª fase que nunca tinha sido listada explicitamente nem no `sysAnalise` nem no `sysFinal`.

**Por que isso importa especificamente para este pipeline:** o filtro original foi desenhado pensando nas fases que acontecem **antes** da pregação (abertura → avisos → dízimo/louvor → pregação), com uma heurística explícita no prompt de que "um culto normalmente tem só UM bloco de transição... blocos antes dessa transição quase sempre pertencem às fases excluídas." Isso deixava um ponto cego: nada impedia a IA de tratar os últimos blocos do vídeo (potencialmente já no encerramento) como se fossem automaticamente pregação, só por estarem "depois" da transição inicial.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**
1. **`sysAnalise`:** novo 5º bullet na REGRA DE EXCLUSÃO OBRIGATÓRIA ("Encerramento do culto: oração final, bênção apostólica, despedida, convite para o próximo culto, avisos de saída — 'vamos declarar', 'que a paz do Senhor esteja convosco', 'boa semana', 'Deus abençoe', chamada final ao altar"). O campo `fase` no JSON de resposta ganhou o valor `"encerramento"` como opção válida. A heurística do "bloco de transição" ganhou um parágrafo espelhado explicando que o culto também termina com um bloco de encerramento, e blocos **depois** desse ponto pertencem à fase excluída — reforçando explicitamente que estar perto do fim do vídeo não significa ser pregação.
2. **`sysFinal`:** mesma extensão nas duas menções de fases excluídas (frase de abertura do prompt + REGRAS INEGOCIÁVEIS), com a REGRA INEGOCIÁVEL ganhando uma frase explícita: "isso vale mesmo para os últimos pontos de conclusão do PASSO 1, perto do fim do vídeo — não assuma que estão automaticamente na pregação."
3. **Nenhuma mudança de código necessária** — a salvaguarda determinística em "Ranking dos Blocos" (`scores.map(s => (s.fase && s.fase !== 'pregacao') ? {...s, score:0} : s)`) já força nota 0 para QUALQUER fase diferente de `"pregacao"`, então basta a IA rotular corretamente um bloco como `"encerramento"` (em vez de erroneamente como `"pregacao"`) para a exclusão funcionar — o mesmo padrão já estabelecido para as outras 4 fases.
4. **Checklist do agente `clipador`** (`.claude/agents/clipador.md`) também atualizado para verificar encerramento explicitamente, com uma dica extra: prestar atenção a clipes cujo `start` fica muito perto da duração total do vídeo original (mais suscetíveis a pegar o encerramento).

**Ainda não testado com uma execução real após este fix.**

---

## Validação do filtro de fase — execução #25 vs #26 (12/07/2026)

**Contexto:** a pedido do usuário ("usar os vídeos que estão na pasta para fazer a validação"), em vez de esperar um novo vídeo ser enviado, analisei a execução mais recente que já tinha rodado nesta sessão (#25) e disparei uma nova execução (#26) no mesmo vídeo para comparação direta antes/depois do filtro de fase.

**Execução #25** (workflow `ID4wisnN4Tqpt2zh`, iniciada 13:34:38 UTC, concluída com sucesso às 18:42:46 UTC — ~5h10min): processou o vídeo "Não é o Fim, é o Crescimento || Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano" (7725s/128:45min, único vídeo presente na pasta de entrada `Videos-Cortes` no momento). Essa execução já tinha o fix do teto de 180s (aplicado 12:29 UTC, antes da execução começar) mas **ainda não** tinha o filtro de fase (aplicado só às 18:53 UTC, depois da execução terminar) — ou seja, é uma amostra real do comportamento do pipeline exatamente no estado "só com o fix de 180s, sem filtro de fase".

**O que a 2ª IA (`GPT — Seleção Final`) retornou:** 8 clipes candidatos. Analisando cada um via `get_execution`:

| # | Título | Intervalo | Duração | Resultado no Montar Clipes | Conteúdo real |
|---|--------|-----------|---------|------------------------------|----------------|
| 1 | melhor-lugar-presenca | 30–69.6s | 39.6s | ✅ Aprovado → idx 01 | **Louvor/abertura** — hook: "Aleluia, eu não sei você, mas eu vim aqui somente para adorar a Ele" |
| 2 | anjos-santo-sem-parar | 69.6–154.1s | 84.5s | ❌ Rejeitado — start igual ao end do clipe 1 (gap 0s < 10s mínimo) | Louvor — sobre anjos adorando "Santo" |
| 3 | adoracao-verdadeira-transborda | 230–311.7s | 81.7s | ✅ Aprovado → idx 02 | **Louvor/abertura** — sobre "adoração verdadeira", "presença não se compra, se recebe" |
| 4 | continue-cavando-sitina | 5838.9–6060.3s | 221.4s | ❌ Rejeitado — excede 180s | Pregação (tema "Sítina", poços de Isaque) |
| 5 | terceiro-poco-alargamento | 6215.4–6380.9s | 165.5s | ✅ Aprovado → idx 03 | **Pregação de fato** — tema do "terceiro poço" (Reobote), ~80% do vídeo |
| 6 | reubot-paz-prosperidade | 6486.1–6698.2s | 212.1s | ❌ Rejeitado — excede 180s | Pregação (continuação do tema Reobote) |
| 7 | era-espirito-alargamento | 6698.2–6894.6s | 196.4s | ❌ Rejeitado — excede 180s | Pregação |
| 8 | milagre-quem-nao-entrou-briga | 6978.4–7208.3s | 229.9s | ❌ Rejeitado — excede 180s | Pregação |

**Achado principal (valida o pedido do usuário):** dos 3 clipes que passaram pelos filtros de código e foram efetivamente cortados e upados para o OneDrive, **2 de 3 (66%) eram conteúdo de louvor/abertura, não pregação**. O bloco 1 da 1ª IA (0–180s, que cobre os clipes 1 e 2 acima) recebeu nota **84/100** no scoring antigo — alta o suficiente para entrar no top 5 e ser repassado à 2ª IA — precisamente porque linguagem de adoração emocional ("Aleluia", "eu vim aqui somente para adorar") pontua bem nos critérios de "emoção" e "impacto" do prompt antigo, que não distinguia louvor de pregação. Isso confirma, com dados reais e não hipotéticos, que o filtro de fase implementado nesta sessão resolve um problema que já estava acontecendo em produção, não um risco teórico.

**Achado secundário (compliance parcial do teto de 180s):** mesmo com o prompt já avisando explicitamente sobre o teto de 180s (fix aplicado antes desta execução), a IA ainda retornou 4 de 8 clipes acima do limite (221s, 212s, 196s, 230s) — todos na segunda metade do vídeo, provavelmente porque esses trechos de pregação têm arcos de raciocínio mais longos e a IA priorizou capturar o pensamento completo mesmo sendo instruída a não fazer isso. **O filtro de código (`dur > 180`) funcionou corretamente como rede de segurança em todos os 4 casos** — nenhum clipe fora do limite vazou para o corte final — mas isso também significa que menos clipes sobrevivem no total (só 3 de 8 candidatos, taxa de aproveitamento de 37.5%). Não é um bug crítico (o sistema continua seguro), mas é um sinal de que a instrução do prompt sozinha não é 100% suficiente para vídeos com arcos de pregação muito longos — se isso se repetir com frequência, vale considerar a abordagem #3 já listada na seção "Bug pendente" (verificação de cada clip END num PASSO 3 dedicado) ou reduzir ainda mais o intervalo sugerido no PASSO 1 (hoje "a cada 40-180s").

**Execução #26 — teste direto com o filtro de fase aplicado:** como o vídeo "Não é o Fim, é o Crescimento" continua sendo o único arquivo elegível na pasta de entrada (`Videos-Cortes`), disparei uma nova execução manual (`execute_workflow`, id **26**) no mesmo vídeo, agora com o workflow já atualizado (filtro de fase + teto de 180s reforçado). Baseado no tempo da execução #25 (~5h10min para este vídeo de 128min, a maior parte em whisper.cpp `large-v3`), o resultado só deve ficar pronto várias horas depois de disparado. **Expectativa a validar quando a execução #26 terminar:** o bloco 1 (0–180s, região de louvor/abertura) deve receber nota ≤5 no `GPT — Analisar Blocos` (campo `fase` deve vir como `"louvor"` ou `"abertura"`), ser descartado no `Ranking dos Blocos`, e nenhum clipe final deve cair no intervalo 0–360s aproximadamente (onde ficam os blocos de louvor identificados nesta análise). Consultar `search_executions` (workflowId `ID4wisnN4Tqpt2zh`) para o status mais recente.

---

## Bug corrigido — IA zerava criteria e aplicava nota-teto de exclusão a blocos de pregação real (13/07/2026)

**Sintoma:** execução #35 (vídeo "Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano.mp4", 3751s/~62min) travou no "Ranking dos Blocos" com `Nenhum bloco atingiu nota minima de 40`. Os 18 blocos vieram assim: `1:5, 2:5, 3:5, 4:5, 5:5, 6:5, 7:5, 8:5, 9:5, 10:5, 11:5, 12:5, 13:5, 14:5, 15:5, 16:5, 17:5, 18:5` — ou seja, todos os blocos, sem exceção, com a mesma nota mínima.

**Diagnóstico:** lendo a resposta bruta da IA (`GPT — Analisar Blocos`) via `get_execution`, o campo `"fase"` (adicionado pelo filtro de fase do culto, sessão de 12/07/2026) mostrou que só o bloco 1 foi classificado como `"abertura"` — os outros 17 blocos vieram todos com `"fase":"pregacao"`, ou seja, a própria IA reconheceu que era conteúdo de pregação de fato. Mesmo assim, TODOS os 17 blocos de pregação vieram com `score:5` e os 7 critérios (`gancho`, `emocao`, `velocidade`, `tom`, `impacto`, `duracao`, `retencao`) zerados. As justificativas em texto (`reason`) eram genuínas e diferenciadas por bloco ("ainda muito introdutório/explicativo", "trecho excessivamente repetitivo", "aplicação pastoral contínua, porém muito repetitiva") — a IA claramente percebeu diferenças de conteúdo entre os blocos, mas não traduziu isso em notas diferentes, aplicando o mesmo valor "5" (o número citado na REGRA DE EXCLUSÃO OBRIGATÓRIA como teto para fases excluídas) mesmo a blocos que ela própria não considerava excluídos.

**Causa raiz:** o prompt `sysAnalise` (implementado em 12/07/2026 para o filtro de fase) dizia "atribua nota MÁXIMA de 5" para fases excluídas, e depois "Na dúvida entre pregação e uma das fases acima, prefira a nota baixa". Não havia nenhuma restrição impedindo a IA de aplicar esse mesmo "5" também a blocos que ela mesma rotulava como `"pregacao"` — nem nenhuma exigência de que `score` batesse com a soma dos 7 critérios individuais. Para um vídeo com estilo de fala muito contínuo (sermão longo, poucos "momentos isoláveis" dentro de cada bloco de 3min), a IA parece ter generalizado o atalho "não tem gancho forte aqui → nota mínima seguro = 5" para blocos inteiros de pregação legítima, em vez de calcular os critérios individualmente (que, mesmo para um bloco fraco, quase sempre somariam algo entre 15-35 pontos — por exemplo, `velocidade` sozinho vale 3-10pts em qualquer bloco com fala, já que o prompt define faixas para fala rápida, lenta e intencionalmente pausada). Isso é diferente do caso do vídeo "Fique Atento à Oportunidade" (09/07/2026), onde os blocos de baixa nota tinham valores diferenciados (9, 9, 9, 9, 10, 44, 57) refletindo julgamento real — aqui, os 17 blocos "5" idênticos e critérios todos zerados são o padrão característico de um atalho degenerado da IA, não uma avaliação genuína.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**
1. **Novo parágrafo no prompt `sysAnalise` — "REGRA DE CONSISTÊNCIA NUMÉRICA"**, inserido logo após a regra de exclusão e antes de "CRITÉRIOS E PESOS": exige explicitamente que `score` seja a soma exata dos 7 valores em `criteria`; deixa claro que a nota-teto de 5 com critérios zerados é reservada EXCLUSIVAMENTE a blocos com `fase` diferente de `"pregacao"`; instrui a IA a nunca copiar o mesmo score/criteria/reason de um bloco anterior; e pede explicitamente que blocos de pregação fraca ainda somem 15-35 pontos realisticamente, com exemplos numéricos por critério.
2. **Salvaguarda de código no "Ranking dos Blocos"** (mais importante que o fix de prompt, porque não depende do modelo obedecer): o código agora lê o campo `"fase"` já retornado pela IA e força `score = 0` para qualquer bloco cuja fase não seja `"pregacao"` — independentemente de qual número a IA tenha escrito. Isso torna a exclusão de fase determinística (decidida em código, não confiando que a IA sempre vai respeitar o teto numérico de 5), e ao mesmo tempo separa claramente "exclusão por fase" (agora 100% código) de "qualidade do conteúdo de pregação" (que continua sendo julgamento da IA, mas agora com uma regra que impede o atalho degenerado).
3. **Mensagem de erro do "Ranking dos Blocos" melhorada**, seguindo o mesmo padrão já usado em "Montar Clipes": quando nenhum bloco atinge a nota mínima, o erro agora inclui a distribuição de fases (`ex: pregacao:17, abertura:1`), detecta se todos os critérios vieram zerados (sinal do bug de scoring descrito acima) e ajusta a "causa provável" de acordo — evitando que o próximo diagnóstico precise repetir manualmente a leitura da resposta bruta da IA como foi feito desta vez.

**Por que a salvaguarda de código (#2) é mais importante que o fix de prompt (#1):** fixes de prompt reduzem a chance do bug acontecer de novo, mas não garantem — modelos de linguagem podem voltar a tomar atalhos em vídeos com estilo de fala parecido. A salvaguarda de código, por outro lado, garante que mesmo que a IA volte a zerar os critérios de blocos de pregação, pelo menos a exclusão de fase (abertura/avisos/dízimo/louvor) continua funcionando de forma determinística — e o erro resultante (se todos os blocos de pregação ainda ficarem abaixo do mínimo) agora chega com diagnóstico automático em vez de exigir investigação manual.

**Fix insuficiente na primeira tentativa — execução #42 reproduziu o mesmo bug (13/07/2026):** a pedido do usuário, disparei uma execução do zero (não Retry) no mesmo vídeo para validar o fix acima. Resultado: **o mesmo bug se repetiu, quase idêntico.** 18 blocos, todos `score:5`, todos os 7 critérios zerados, 18 de 18 marcados `fase:"pregacao"` pela própria IA (dessa vez nem o bloco de abertura foi excluído — a IA classificou até a leitura bíblica inicial como pregação, o que é tecnicamente correto). As justificativas de texto continuavam diferenciadas e plausíveis ("ainda não é desenvolvimento pleno da mensagem", "trecho excessivamente repetitivo, sem progressão narrativa", "conteúdo praticamente duplicado") — ou seja, a REGRA DE CONSISTÊNCIA NUMÉRICA (que pedia explicitamente para a IA calcular os critérios e não usar 5 fora do caso de exclusão) não foi suficiente para mudar o comportamento do modelo. A salvaguarda de código (força `score=0` só para `fase != "pregacao"`) funcionou como projetado — não foi ela que causou a falha, foi a ausência de qualquer bloco com nota real acima do piso.

**Segundo diagnóstico — problema de ancoragem, não de instrução:** a hipótese revisada é que o formato do rubric (somar pontos a partir de 0 em 7 critérios, todos com peso e faixas "ideais" bem definidas) empurra o modelo a julgar cada bloco de 3min como se ele próprio precisasse ser um Short pronto e editado — e como um bloco cru de fala contínua raramente parece "pronto" (sem gancho editado, sem pico de emoção isolado, "ainda não chegou no ponto forte do sermão"), o modelo colapsa para o valor mais seguro que já viu no prompt (5, o número usado no exemplo de exclusão), mesmo depois de ser instruído a não fazer isso. Reforçar a REGRA em texto não resolveu porque o problema não era falta de instrução — era o ANCORAMENTO do rubric aditivo (começar de 0 e somar) predispor a notas baixas por padrão sempre que nenhum critério "salta aos olhos".

**Segundo fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`), trocando a estrutura do rubric:**
1. **Novo parágrafo "FILTRO GROSSEIRO"** logo antes de CRITÉRIOS E PESOS: explica à IA que esta etapa é um filtro grosseiro de relevância sobre blocos de ~3min, não a escolha do clipe final (isso acontece depois, com a transcrição completa) — portanto um bloco de pregação comum, sem nada excepcional nem horrível, deve receber nota MÉDIA (faixa 40-55), não uma nota baixa. Isso ataca diretamente a suposição errada que o modelo parecia estar fazendo (julgar o bloco como se precisasse ser o Short final).
2. **Rubric reescrito de aditivo para "baseline + ajuste"**: cada um dos 7 critérios ganhou um valor BASE explícito (ex: gancho BASE 10pts de 25, emoção BASE 10pts de 20, impacto BASE 8pts de 20) — a IA agora parte desse valor médio e ajusta para cima ou para baixo, em vez de começar de 0 e "ganhar" pontos. Cada critério também ganhou uma frase proibindo 0 no caso comum ("sem gancho editorial pronto = mantenha ao menos 5-8pts... isso é normal, não indica bloco ruim").
3. **REGRA DE CONSISTÊNCIA NUMÉRICA reforçada com piso explícito**: "um bloco de pregação só deve somar MENOS de 20 pontos totais se for GENUINAMENTE inutilizável (leitura de versículo sem aplicação, ruído técnico, repetição EXTREMA e LITERAL >80% do bloco)" — e uma lista explícita do que NÃO justifica nota baixa (repetição moderada, tom pausado, falta de gancho pronto, "ainda não chegou ao ponto alto").
4. **Regra de exclusão ajustada**: adicionado "INCLUINDO leitura bíblica de abertura da mensagem e contextualização inicial do tema — isso ainda é pregação, não é abertura do culto" — para reduzir a chance da IA classificar os primeiros blocos de um sermão (que tipicamente começam com leitura de texto bíblico) como "abertura" por engano.

**Por que essa mudança é estruturalmente diferente da primeira tentativa:** o primeiro fix pediu para a IA "não fazer o atalho" (regra negativa, "não copie a mesma nota"). O segundo fix muda o que a IA está calculando — em vez de "some pontos até chegar numa nota", agora é "comece de uma nota razoável e ajuste". Isso é uma mudança de enquadramento (framing), não apenas mais uma instrução empilhada nas anteriores, que é a abordagem que tem mais chance de alterar esse tipo de comportamento de modelo.

**Ainda não testado com uma reexecução real após este segundo fix.** Esta é a terceira vez que o pipeline chega até este ponto com o mesmo vídeo (execuções #35 e #42 falharam aqui, ambas ~3h45-4h de processamento) — antes de disparar uma quarta execução do zero, vale considerar usar o botão "Retry" do n8n na execução #42 (reaproveita download+whisper já feitos, só re-chama a IA a partir de "GPT — Analisar Blocos") para validar mais rápido, já que o vídeo e a transcrição não mudam entre tentativas.

---

## Terceira falha consecutiva e mudança de estratégia — "Ranking dos Blocos" vira fallback, não trava (13-14/07/2026)

**Execução #47 (fresh run com o rubric baseline) reproduziu o mesmo bug pela 3ª vez:** vídeo "Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano.mp4" (3751s/~62min, 10.07GiB). Rodou 3h24min (01:14–04:38 UTC) e falhou de novo no "Ranking dos Blocos": 17 blocos de pregação, todos nota 5. Mas desta vez a resposta bruta da IA mostrou uma diferença importante em relação às tentativas #35 e #42: nos blocos 2–12 a IA finalmente **calculou os critérios individualmente** em vez de zerar tudo (ex: bloco 2 = `{gancho:1, emocao:1, velocidade:0, tom:1, impacto:1, duracao:0, retencao:1}`, soma 5) — ou seja, a REGRA DE CONSISTÊNCIA NUMÉRICA funcionou desta vez. O problema é que ela deu nota 1 (quase o piso) pra quase todo critério, ignorando os valores BASE sugeridos (10, 10, 7, 5, 8, 5, 3 = ~48 de soma esperada). Nos blocos 13–18 ela voltou a zerar tudo, mas com justificativas coerentes ("repetição literal massiva da mesma frase", "conteúdo praticamente todo repetido") — sinal de que, pelo menos nesses blocos finais, a nota baixa reflete conteúdo genuinamente repetitivo, não um bug de scoring.

**Mudança de diagnóstico:** juntando as 3 execuções reais (#35, #42, #47) com 2 reformulações de prompt diferentes, todas convergem para o mesmo veredito sobre este vídeo específico — pouco gancho, pouca variação de tom, muita repetição, segundo os 7 critérios do prompt. Isso deixou de parecer um bug de prompt isolado e passou a parecer um traço genuíno (ainda que possivelmente exagerado) do estilo de fala deste pregador neste sermão específico, captado de forma consistente por chamadas de IA independentes. Insistir numa 3ª rodada de prompt engineering teria retorno decrescente, especialmente considerando o custo de ~3-4h de VPS por tentativa.

**Fix estrutural aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`), a pedido do usuário:** o "Ranking dos Blocos" não trava mais o pipeline quando nenhum bloco atinge `minBlockScore`. Em vez de lançar erro, agora verifica se existe pelo menos um bloco com `fase === "pregacao"` (mesmo com nota baixa):
- Se **nenhum** bloco for de pregação (só abertura/avisos/dízimo/louvor), o erro original é mantido — não há o que fazer, o vídeo realmente não tem conteúdo elegível.
- Se **existem** blocos de pregação mas nenhum atinge a nota mínima, o código agora **prossegue mesmo assim**, usando até 8 desses blocos (em vez dos 5 do caminho normal) como `topBlocksSummary` para a 2ª IA — sem aplicar filtro de nota. Um campo novo `blockScoringFallback: true` (+ `blockScoringFallbackReason` com o motivo) fica disponível nos dados da execução para diagnóstico, mas não é usado para nenhuma lógica adicional.

**Por que isso é seguro:** a 2ª IA ("Seleção Final") já recebia a transcrição SRT **completa** independentemente do resultado do "Ranking dos Blocos" (`$json.srtContent`) — o `topBlocksSummary` sempre foi só uma dica/destaque para guiar a atenção da IA, não a única fonte de informação. Isso significa que a etapa de block-scoring nunca foi, estruturalmente, o único lugar onde a qualidade do conteúdo é avaliada — é um filtro grosseiro de otimização (reduzir o que entra no prompt como "destaque"), não um portão de qualidade indispensável. Deixar essa etapa ser consultiva em vez de obrigatória não remove nenhuma camada real de proteção — a 2ª IA continua fazendo sua própria análise fina com o checklist de cobertura de janelas, o teto de 180s e o filtro de fase, todos aplicados independentemente do resultado do "Ranking dos Blocos".

**Ainda não testado com uma reexecução real após este fix.** Esta seria a 4ª tentativa real com este vídeo — as 3 anteriores (#35, #42, #47) já consumiram juntas mais de 11h de processamento sem produzir um clipe sequer. Validar se o fallback realmente permite que a 2ª IA extraia clipes utilizáveis da transcrição completa, mesmo com blocos de baixa pontuação como guia.

---

## Bug corrigido — "moov atom not found" no FFprobe/FFmpeg (09/07/2026)

**Sintoma:** o node "FFprobe + Extrair Áudio" falhava logo no início da execução (poucos segundos) com:
```
[mov,mp4,m4a,3gp,3g2,mj2 @ ...] moov atom not found
...: Invalid data found when processing input
```
Essa mensagem do FFmpeg normalmente indica arquivo MP4 corrompido, mas o diagnóstico via `get_execution` (nodes "Selecionar Vídeo" e "Baixar Vídeo") revelou a causa real: o arquivo listado pela Microsoft Graph API tinha **`"size": 0`** e hash zerado (`quickXorHash: "AAAA..."`), e o "Baixar Vídeo" de fato baixou **0 bytes** (`"fileSize": "0 B", "bytes": 0`). O arquivo (`createdDateTime`) tinha sido criado no OneDrive apenas ~3 minutos antes da execução rodar — ou seja, o vídeo ainda estava sendo sincronizado pelo OneDrive desktop client no computador do usuário quando o workflow disparou (comum em arquivos grandes de culto ao vivo, que podem levar bastante tempo para subir). O workflow baixou um arquivo vazio/placeholder e só descobriu o problema 3 nodes depois, com uma mensagem de erro enganosa.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):** o node "Selecionar Vídeo" agora filtra candidatos por tamanho mínimo (`MIN_SIZE = 1MB`) antes de escolher o vídeo a processar. Se todos os vídeos encontrados na pasta estiverem abaixo desse tamanho, o node falha imediatamente com uma mensagem clara e acionável ("ainda parece estar sincronizando com o OneDrive... aguarde e rode novamente") em vez de deixar o erro estourar de forma críptica lá na frente no FFprobe. Efeito colateral útil: se houver múltiplos vídeos na pasta e um deles ainda estiver sincronizando, o filtro pula automaticamente o(s) arquivo(s) incompleto(s) e escolhe um vídeo já pronto, em vez de pegar sempre `items[0]` (o primeiro da lista, não necessariamente o disponível).

**Ainda não testado com uma sincronização real em andamento** — a mudança foi validada por leitura de código/JSON, mas o cenário exato (dois vídeos na pasta, um pronto e um sincronizando) não foi reproduzido em execução real nesta sessão.

---

## Legendas — desabilitadas (08/07/2026)

O usuário pediu para desabilitar a legenda queimada nos clipes finais. Antes, cada clipe passava por um sub-pipeline extra depois de "Montar Clipes": extrair o áudio só daquele trecho (`Extrair Áudio do Clipe`), rodar o whisper.cpp de novo só nesse trecho para gerar um `.srt` palavra-a-palavra (`Whisper.cpp Transcrever Clipe`, com `--max-len 1 --split-on-word`), e então o FFmpeg usava esse `.srt` no filtro `subtitles=...` para queimar o texto no vídeo. Isso significava rodar o whisper.cpp **duas vezes** por vídeo: uma vez na transcrição completa (para os prompts de IA) e mais uma vez por clipe (só para gerar a legenda visual).

**O que foi removido (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**
- Node `Extrair Áudio do Clipe` (ffmpeg extraía o áudio do trecho do clipe)
- Node `Preparar Whisper Clipe` (só repassava o item do loop)
- Node `Whisper.cpp Transcrever Clipe` (2ª chamada ao whisper.cpp, por clipe)
- Node `Preparar Corte Final` (só repassava o item do loop)
- Renomeado `FFmpeg Cortar 9:16 + Legenda` → `FFmpeg Cortar 9:16`, e o comando FFmpeg não usa mais `-vf "...,subtitles=...:force_style=..."` — só `-vf "scale=-2:H,crop=W:H:..."` (mesmo crop 9:16, sem o filtro de legenda).
- Reconexão: `Loop Over Items` (saída 1, o branch de processamento por item) agora liga direto em `FFmpeg Cortar 9:16`, pulando os 4 nodes removidos.

**Resultado:** 33 nodes → 29 nodes. Menos uma chamada de whisper.cpp por clipe → workflow mais rápido e mais leve de CPU na VPS (a transcrição completa continua rodando normalmente, só a repetição por clipe que sumiu).

**Configuração no HTML:** o checkbox "Incluir legendas queimadas" (`include-subtitles`) e o default `cfg.includeSubtitles` foram trocados para desmarcado/`false`. Se o usuário quiser reativar legendas no futuro, basta marcar o checkbox na aba Configurar antes de gerar o JSON — a lógica condicional (`sub` flag em `buildBlockWorkflow()`) que monta o sub-pipeline de legenda continua no código, só não é usada por padrão agora.

**Nota sobre `Montar Clipes` e `Limpar Arquivos do Clipe`:** o campo `audioPath` do clipe (usado antigamente pelo `Extrair Áudio do Clipe`) ainda é gerado em `Montar Clipes` por conveniência de código, mas nunca é criado como arquivo real agora — é inofensivo (`rm -f` num arquivo inexistente não dá erro). Os campos `srtBase`/`srtPath` do clipe (que só existiam quando `sub=true`) não são mais incluídos.

---

## Correção de timing dos cortes — threshold dinâmico + snap simétrico de início/fim (29/07/2026)

**Contexto:** a auditoria do agente clipador (ver seção acima) encontrou 45% dos clipes já gerados com corte comprovadamente em cima de fala contínua. Investigando a causa raiz do `silencePrefix` (mecanismo de extensão do `end` por silêncio, documentado abaixo como "estado atual" até este fix), foram encontrados **2 bugs reais e independentes**, não apenas uma hipótese de prompt/IA:

**Bug 1 — threshold de ruído fixo em `-30dB` incompatível com o piso de ruído real das gravações.** Medido via `volumedetect` em amostras reais: o piso de ruído ambiente varia de -13dB a -25dB dependendo da gravação (mic de igreja, room tone, sistema de som) — sempre acima (mais alto/menos rigoroso) do que -30dB fixo, fazendo o `silencedetect` nunca disparar na prática.

**Bug 2 — `$NF` no awk de parsing pegava o campo errado.** A linha real de saída do ffmpeg vem assim: `silence_end: 752.609229 | silence_duration: 0.485805` — **na mesma linha**. `$NF` (último campo) pega `0.485805` (a duração do silêncio), não `752.609229` (o timestamp que o código precisa). Como durações de silêncio são tipicamente <3s e os timestamps de vídeo ficam na casa das centenas/milhares de segundos, a condição `t>e` (onde `e` é o `OEND` absoluto) praticamente NUNCA era verdadeira — **este bug sozinho já explica por que a extensão parecia nunca funcionar**, independente do threshold. Confirmado batendo a duração real de clipes já cortados (via `ffprobe`) contra `end - start` do `_meta.json`: em 3 amostras reais, a duração bate EXATAMENTE — nenhuma extensão foi aplicada em nenhuma delas, apesar do mecanismo estar "documentado como funcionando" desde antes desta sessão. Esse segundo bug é o mais grave dos dois: mesmo corrigindo só o threshold, o `$NF` errado continuaria bloqueando a extensão na quase totalidade dos casos.

**Descoberta adicional durante a validação local — comportamento de `-ss`/timestamps depende do build do ffmpeg.** Testado localmente (Windows, ffmpeg nightly N-124716) que timestamps de `silencedetect` vêm **relativos ao ponto de seek** por padrão (não absolutos), contrariando o que a documentação antiga descrevia como comportamento do ffmpeg da VPS (Alpine). A flag `-copyts` resolve isso de forma determinística (força timestamps absolutos, preservados do arquivo original) — adicionada nas duas chamadas de `silencedetect`, tornando o comportamento correto e **independente de qual build/versão de ffmpeg está rodando**, em vez de depender de um comportamento implícito não documentado que pode variar.

**3 mudanças implementadas (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`), validadas localmente end-to-end contra vídeos reais antes de aplicar em produção:**

1. **Threshold de ruído calibrado por vídeo, não mais fixo.** Novo passo em "FFprobe + Extrair Áudio": depois de extrair o áudio mono 16kHz, roda `ffmpeg -af volumedetect` nesse áudio já extraído (rápido, não decodifica o vídeo de novo) e captura `mean_volume`. "Preparar Whisper Blocos" calcula `noiseThreshold = mean_volume - 12dB`, limitado à faixa `[-40, -18]` (nunca mais permissivo que -18dB, nunca mais rigoroso que -40dB), e propaga esse valor por todo o pipeline (`Montar Clipes` → cada item do `Loop Over Items` → "FFmpeg Cortar 9:16") — computado **uma vez por vídeo**, não por clipe.
2. **`$NF` trocado por busca robusta de campo:** em vez de `t=$NF+0` (pega o último campo, errado), agora `for(i=1;i<=NF;i++) if($i=="silence_end:") t=$(i+1)+0` — encontra o token `silence_end:` e pega o campo logo depois, imune a quantos campos vêm antes/depois na linha (ex: o sufixo `| silence_duration: X` que causava o bug).
3. **Snap simétrico do início (`ASTART`) — não existia nenhuma correção do `start` antes disso, só o `end` era estendido.** Busca janela de até 15s antes do `clipStart` da IA (`MINSTART = clipStart - 15`, nunca negativo) por um `silence_end` próximo (tolerância de +1s depois do `clipStart` também, para pegar silêncios que terminam bem em cima do ponto escolhido). Usa o candidato **mais próximo** de `clipStart` (não só "o último antes"), com fallback para o `clipStart` original se nada for encontrado na janela — nunca quebra, só deixa de corrigir. `MAXEND` passou a ser calculado a partir do `ASTART` já ajustado (não do `clipStart` original) para nunca permitir que a soma de uma extensão do início + extensão do fim ultrapasse o teto de 180s.

```bash
# FFmpeg Cortar 9:16 (produção) — versão corrigida
NOISE={{ $json.noiseThreshold }}
OSTART={{ $json.clipStart }}
OEND={{ $json.clipEnd }}
MINSTART=$(awk -v s="$OSTART" 'BEGIN{v=s-15; printf "%.3f", (v<0?0:v)}')
SRAW2=$(ffmpeg -y -copyts -ss "$MINSTART" -t 17 -i "{{ $json.videoPath }}" \
  -af "silencedetect=noise=${NOISE}dB:duration=0.3" -f null - 2>&1 | grep "silence_end" \
  | awk -v s="$OSTART" 'BEGIN{best="";bestdiff=999} {for(i=1;i<=NF;i++) if($i=="silence_end:") t=$(i+1)+0; diff=t-s; if(diff<0)diff=-diff; if(t<=s+1 && diff<bestdiff){best=t;bestdiff=diff}} END{if(best!="")print best}')
ASTART=$(awk -v s="$OSTART" -v r="$SRAW2" -v mn="$MINSTART" \
  'BEGIN{r=r+0; if(r>0 && r>=mn && r<=s+1) printf "%.3f",r; else printf "%.3f",s}')
MAXEND=$(awk -v s="$ASTART" 'BEGIN{printf "%.3f", s+180}')
SEEK=$(awk -v e="$OEND" 'BEGIN{printf "%.3f", e-2}')
SRAW=$(ffmpeg -y -copyts -ss "$SEEK" -t 92 -i "{{ $json.videoPath }}" \
  -af "silencedetect=noise=${NOISE}dB:duration=0.3" -f null - 2>&1 | grep "silence_end" \
  | awk -v e="$OEND" '{for(i=1;i<=NF;i++) if($i=="silence_end:") t=$(i+1)+0; if(t>e){print t; exit}}')
AEND=$(awk -v e="$OEND" -v r="$SRAW" -v m="$MAXEND" \
  'BEGIN{r=r+0; if(r>e && r<=m) printf "%.3f",r; else if(e<=m) printf "%.3f",e; else printf "%.3f",m}')
```

**Validado localmente antes de aplicar em produção:** rodado o comando completo (real, não simulado) contra o vídeo "Os três voos da pomba - Pr. Rodnei Romano.mp4" e o clipe real `familia-na-arca` (start=601.8, end=736.3, um caso RUIM confirmado pela auditoria). Resultado: `ASTART` permaneceu 601.8 (sem silêncio próximo do início — confirmado como um caso genuinamente sem solução algorítmica, precisa de fix de prompt/seleção da IA, não de código) e `AEND` mudou de 736.3 para **755.719** (extensão de ~19.4s até a próxima pausa real, dentro do teto de 180s) — a extensão finalmente funcionou, e a duração do arquivo cortado bateu exatamente com `AEND - ASTART`. Antes do fix do bug do `$NF`, o mesmo teste retornava `AEND = OEND` sem nenhuma mudança (extensão sempre no-op).

**Validado com execução real de produção (30/07/2026) — execução #143, mesmo vídeo de teste (Igreja Mahanaim, Pr. André Ribeiro 26/07) processado pela 3ª vez na mesma sessão, agora com os 5 fixes juntos (threshold dinâmico + awk corrigido + snap simétrico + filtro de encerramento + modelo `gpt-5.6-luna`):** o agente `clipador` validou os 8 clipes desta execução contra o vídeo original. Resultado: **0 OK, 4 SUSPECT, 4 RUIM (50%)** — uma melhora real frente às duas execuções anteriores do mesmo vídeo (pré-fix: 4/6 RUIM = 67%; execução intermediária só com fixes de timing, sem filtro de encerramento: 7/8 RUIM = 87.5%, pior que o baseline porque esse vídeo específico tem uma cama de áudio/música contínua de fundo que eleva o piso de ruído mesmo nas pausas de fala). A taxa de RUIM caiu de 87.5% para 50% com os fixes completos, mas não chegou a zero.

**Achados desta validação:**
- **0 violações de duração, gap, ou vazamento de fase (incluindo o novo filtro de encerramento)** — essas regras continuam sólidas. Nenhum dos 8 clipes vazou conteúdo de abertura/dízimo/louvor/encerramento, mesmo o clipe mais próximo do fim (79.6% do vídeo, ~28min de sobra) tinha hook/reason claramente ligado à pregação, não a uma despedida.
- **Calibração de threshold precisou de ajuste manual nesta validação:** a fórmula padrão (`mean_volume - 12dB`) sugeriu ~-28dB para este vídeo, mas -28dB (e o antigo -30dB fixo) continuavam rígidos demais — vários pontos não detectavam silêncio nem em janelas de ±12s. O agente recalibrou manualmente para -20dB (dentro da faixa válida `[-40,-18]`) e conseguiu achar pausas reais que -28dB não via. Isso não invalida o fix (a calibração dinâmica é estritamente melhor que um valor fixo), mas confirma que `mean-12dB` é um ponto de partida razoável, não uma fórmula perfeita — vídeos com cama de áudio contínua podem precisar de mais margem.
- **Um clipe (o 8º, `filhos-sao-flechas`) não teve nenhuma pausa detectável em NENHUM threshold testado (-30 a -13dB) em nenhum dos dois lados** — confirmado com frames mostrando gestos de mão em movimento e uma criança sendo trazida ao palco, sinal de um momento de "ministração"/apelo emocional intenso onde estruturalmente pode não existir pausa de fala real. Este é exatamente o cenário já documentado como limitação conhecida do fix (ver acima): quando não há pausa real na janela de busca, nenhum ajuste de threshold ou snap de código resolve.
- **Sinal novo e barato encontrado:** o único clipe com um hook começando por conjunção de continuação ("Porém...") também foi o único com o início confirmado RUIM por áudio — sugere que checar o hook por palavras de continuação antes mesmo de rodar `silencedetect` já seria um proxy grátis para sinalizar candidatos a corte ruim.

**Conclusão prática:** os fixes de código (threshold dinâmico, awk, snap simétrico) parecem ter atingido o teto do que dá para resolver algoritmicamente — a melhora foi real (87.5%→50%) mas o gargalo restante é estrutural: vídeos/trechos sem pausa de fala longa o suficiente não têm onde o código ancorar a correção. O próximo ganho relevante provavelmente exige atacar a escolha do `start`/`end` na própria IA (abordagem #3 do "Bug pendente" — verificação de cada ponto relendo o que vem antes/depois — ou #5, dividir a seleção por janela), não mais ajuste de threshold/parsing.

**Limitação conhecida, não resolvida por este fix:** quando não existe NENHUMA pausa real na janela de busca (nem antes do início, nem depois do fim — os casos "RUIM" mais graves da auditoria, ex: `nenhum silencio (±6s)`), o snap de código não tem o que corrigir — ele so pode alinhar a um silêncio que existe, não criar um do nada. Esses casos exigem um fix na escolha do `start`/`end` pela própria IA (abordagem #3 do "Bug pendente" — verificação de cada ponto pela IA relendo o que vem antes/depois — ou #5, dividir a seleção por janela), ainda não implementado.

---

## Bug crítico corrigido — snap de silêncio por clipe podia gerar sobreposição de conteúdo entre 2 Shorts (31/07/2026)

**Contexto:** a pedido do usuário ("procure possibilidades de melhorar os cortes... traga todas as possibilidades, mas não faça nenhuma alteração"), foi feita uma investigação de pesquisa (sem aplicar nada) sobre a execução #143 (mesmo vídeo usado na validação de 30/07/2026, Igreja Mahanaim, Pr. André Ribeiro). O agente `clipador` foi melhorado com duas capacidades novas: (1) detectar que `_meta.json` está desatualizado desde 29/07/2026 (guarda só o `start`/`end` bruto escolhido pela IA, nunca os valores REAIS pós-ajuste de silêncio que o FFmpeg efetivamente usa) e recalcular os valores reais localmente antes de validar; (2) checar gap/sobreposição entre clipes CONSECUTIVOS usando esses valores reais recalculados, não os brutos.

**Achado crítico:** recalculando `ASTART`/`AEND` reais dos 8 clipes da execução #143 (reproduzindo exatamente a fórmula de produção, `NOISE=-28.5`) e comparando por `ffprobe` contra os arquivos `.mp4` já cortados (bateu exatamente), o gap real entre clipes consecutivos ficou:

| Par | Gap real (pós-ajuste) |
|---|---|
| clip1 → clip2 | 0.0s |
| clip2 → clip3 | **-2.46s (sobreposição real de conteúdo entre 2 Shorts já publicados)** |
| clip3 → clip4 | 3.83s |

**Causa raiz:** o snap de início (`ASTART`, adicionado em 29/07/2026) e a extensão de fim (`AEND`) rodam de forma isolada por item do `Loop Over Items` — cada clipe só enxerga o próprio `noiseThreshold`/`clipStart`/`clipEnd`, sem nenhuma noção de onde o vizinho ficou depois do PRÓPRIO ajuste. Antes de 29/07/2026 só o fim era estendido (nunca o início), então esse risco era menor; com os dois lados se movendo um em direção ao outro, colisão passou a ser fisicamente possível mesmo respeitando o gap mínimo bruto de 10s (a extensão pode consumir mais do que o gap bruto oferecia). Esse bug nunca tinha sido percebido porque toda auditoria anterior (inclusive a validação de 30/07/2026) comparava contra o `_meta.json`, cujo `start`/`end` sempre foi o valor BRUTO da IA — nunca refletiu o corte real, e por isso nunca revelou a sobreposição.

**Fixes aplicados nesta sessão (HTML + `workflow-blocos.json`, validados byte-a-byte via harness Node — MCP do n8n estava desconectado, produção NÃO foi tocada, ver aviso abaixo):**

1. **Trava determinística de colisão entre vizinhos** — em "Montar Clipes", cada clipe do array `results` agora carrega `prevClipEnd`/`nextClipStart` (o `clipEnd`/`clipStart` BRUTO do vizinho anterior/seguinte, `null` nas pontas). O bash de "FFmpeg Cortar 9:16" recebe esses dois valores (com sentinelas `-1`/`999999999` para "sem vizinho") e, depois de calcular `ASTART`/`AEND` normalmente, aplica um clamp final com `MINGAP=5`: se o `ASTART` ajustado ficar mais cedo que `prevClipEnd+5`, cai de volta no `OSTART` bruto da IA; se o `AEND` ajustado ultrapassar `nextClipStart-5`, cai de volta no `OEND` bruto. Como o gap mínimo bruto (ver item 2) já garante que `OSTART`/`OEND` sozinhos respeitam essa distância, o fallback nunca fica pior que o comportamento pré-29/07 (sem ajuste nenhum) — só impede que o AJUSTE piore a situação.
2. **Gap mínimo bruto entre clipes aumentado de 10s para 15s** (código em "Montar Clipes" + as duas menções no prompt `sysFinal`, PASSO 2 regra (d) e REGRAS INEGOCIÁVEIS) — margem de segurança extra para o clamp acima ter espaço de sobra antes de precisar recair no bruto.
3. **Tolerância do snap de início alargada de `s+1` para `s+3`** (nas duas condições awk, `t<=s+1`→`t<=s+3` e `r<=s+1`→`r<=s+3`) — a mesma auditoria encontrou um caso real (clipe 3 da execução #143) onde o candidato de silêncio mais próximo do `start` ficava a ~2s de distância e não era usado por só 1s de folga a menos.
4. **`ASTART`/`AEND` reais persistidos no `_meta.json`** como campos novos `real_start`/`real_end` (via `awk` reescrevendo o JSON já gravado em disco, logo após o `printf` original — `sed -i` com inserção multi-linha não é confiável no busybox sed da VPS Alpine). Os campos `start`/`end` originais continuam sendo a escolha BRUTA da IA (não alterados, para não quebrar nada que já leia esses campos) — `real_start`/`real_end` é puramente aditivo. Resolve a lacuna que permitiu o bug de sobreposição passar despercebido: agora qualquer auditoria futura (agente `clipador` ou manual) lê o corte real direto do metadado, sem precisar recalcular a fórmula do zero.

**Validação feita antes de aplicar:** harness Node (`vm.createContext`, mesmo padrão de sessões anteriores) rodando `buildBlockWorkflow()` do HTML real com os defaults de produção (`min-clip=45`, `ai-engine=openai`, `min-block-score=40`) — sintaxe do `Montar Clipes` validada com `new Function()`, comando bash validado com `sh -n`, e a lógica do clamp de colisão + o patch de `real_start`/`real_end` testados isoladamente com `awk` fora do n8n usando números reais da execução #143 (incluindo o cenário exato clip2/clip3 que causou a sobreposição — confirmado que o clamp agora rejeita o ajuste e cai no bruto). `workflow-blocos.json` foi então patchado cirurgicamente (só os 3 nodes tocados: `Montar Clipes`, `FFmpeg Cortar 9:16`, `Preparar GPT — Seleção Final`) e reconferido byte-a-byte contra a saída do harness.

**⚠️ Atualização (31/07/2026, mesmo dia, sessão seguinte): MCP do n8n reconectado — fix aplicado em produção.** Comparado `get_workflow_details` de `ID4wisnN4Tqpt2zh` byte-a-byte contra `workflow-blocos.json` nos 3 nodes tocados (`Montar Clipes`, `FFmpeg Cortar 9:16`, `Preparar GPT — Seleção Final`) — a diferença encontrada foi exatamente a esperada (gap 10s→15s, clamp de colisão com `prevClipEnd`/`nextClipStart`, tolerância `s+1`→`s+3`, persistência de `real_start`/`real_end`), sem nenhum outro drift. Aplicado via `update_workflow` (`updateNodeParameters` nos 3 nodes, atômico) + `publish_workflow` (`activeVersionId` novo: `bfdecd11-bc5a-421d-b526-15b881044b0d`). Reconferido pós-publish: os 3 nodes em produção batem 100% com `workflow-blocos.json`.

**Ainda não testado com uma execução real** — o fix está em produção e publicado, mas falta uma execução de ponta a ponta com um vídeo novo para confirmar que o clamp de colisão realmente elimina a sobreposição (o vídeo #143 já foi processado; validar no próximo vídeo da fila).

**✅ Validado com 4 execuções reais pós-fix (17/08/2026) — ver seção "Auditoria de melhorias" abaixo:** o agente `clipador` confirmou **zero overlaps reais** em 20 pares de clipes consecutivos across as execuções #163, #177, #194 e #203 (03–12/08/2026). Porém identificou uma lacuna residual no design do clamp: como cada lado só compara contra o valor **BRUTO** do vizinho (não o valor já ajustado dele), os dois lados podem se mover um em direção ao outro simultaneamente e ainda assim passar despercebidos pelo clamp — 3 de 20 pares ficaram abaixo do gap mínimo pretendido de 15s, incluindo 1 caso real (Pr. Hiro Delgado, clip4→clip5) que rompeu até o piso de segurança de 5s do próprio clamp, com gap real de **4.74s**. Não é overlap (ainda positivo), mas é a evidência de que o clamp elimina o cenário que o motivou (overlap franco) sem fechar 100% a lacuna matemática. Fix ainda não aplicado — ver detalhes e sugestão na seção de auditoria.

---

## Auditoria completa de melhorias — performance, integração e qualidade (17/08/2026)

**Pedido do usuário:** levantar todas as possibilidades de melhoria do pipeline (performance, integração, qualidade), com a parte de qualidade obrigatoriamente validada pelo agente `clipador` contra dados reais, não suposição. Nenhuma mudança foi aplicada nesta sessão — é um levantamento para priorização futura.

**Qualidade — auditoria do `clipador` em 24 clipes reais (execuções #163, #177, #194, #203 — as 4 execuções completas rodadas em produção entre 03/08 e 12/08/2026, todas já com o fix de clamp de colisão de 31/07/2026):**

- **Resultado agregado: 45.8% OK / 45.8% SUSPEITO / 8.3% RUIM (2 de 24)** — melhora grande frente ao histórico (45–50% RUIM nas auditorias de 29–30/07, pré/parcial-fix). **Overlap real entre clipes: 0 casos confirmados.**
- **Achado metodológico do próprio clipador:** o piso de ruído varia ~7dB *dentro do mesmo vídeo* (não só entre vídeos) — uma calibração de 1 amostra por vídeo (o que o código de produção faz hoje em "FFprobe + Extrair Áudio"/"Preparar Whisper Blocos") pode ficar imprecisa em trechos localmente mais ruidosos ou mais silenciosos. Isso vale tanto para a extensão de silêncio real do FFmpeg quanto para futuras auditorias.
- **Clamp de colisão (Q1, detalhado na seção acima):** usa o valor bruto do vizinho, não o ajustado — permite erosão combinada dos dois lados. Sugestão: comparar contra o valor já ajustado do vizinho, ou processar os clipes em sequência dentro do loop em vez de isoladamente por item.
- **Hook com conjunção de continuação é sinal barato e não-redundante ao silencedetect:** 2 de 24 clipes têm `hook` começando com "Então"/"Mas" (`jesus-e-o-amor` e `a-historia-nao-acabou`), ambos com áudio de início tecnicamente limpo mas conteúdo sugerindo meio de frase. Sugestão: checagem programática simples (regex nas primeiras palavras do `hook`) no `Montar Clipes`, gravada no meta como sinal de alerta adicional.
- **`block_score`/`criteria` são por bloco (~3min), não por clipe:** clipes diferentes fatiados do mesmo bloco herdam nota e critérios idênticos (confirmado: execução #203, 6 de 8 clipes com `criteria` byte-idêntico), e 4 de 24 clipes ficaram com `block_score: null` (clipe final não caiu dentro de nenhum bloco do `topBlocksSummary`) — não correlacionou com pior timing, mas limita diagnóstico por clipe individual.
- **`retention_score` sem poder discriminante:** todos os 24 clipes da amostra ficaram entre 84–96 (nenhum abaixo de 84) — como só clipes escolhidos são pontuados pela 2ª IA, a métrica hoje não ajuda a priorizar qual short postar primeiro.
- **Padrão forte por vídeo/pregador, não só por pregador:** Pr. Hiro Delgado ("Deus Não Deixa Inacabado") teve 87.5% dos clipes com algum desvio de timing, contra 20–33% nos outros 3 vídeos. O mesmo pregador (Pr. Daniel dos Santos) variou de 33% a 60% entre 2 vídeos diferentes — confirma que a cadência específica do sermão/dia pesa mais que o pregador como categoria fixa.
- **Positivo confirmado:** zero violação de duração/gap bruto, zero vazamento de fase (abertura/dízimo/louvor/encerramento) nos 24 clipes, e a regra de consistência numérica do scoring (bug histórico de "tudo nota 5", ver seção "Bug corrigido — IA zerava criteria") não reapareceu em nenhuma das 4 execuções.

**Performance/confiabilidade — achados via `get_workflow_details` no workflow de produção:**

- `GPT — Analisar Blocos` e `GPT — Seleção Final` **sem `retryOnFail`** — um timeout/5xx transitório da API derruba a execução inteira depois de já ter pago horas de whisper.cpp. Diferente de "Baixar Vídeo"/"Upload Short/Metadados" (que já têm retry desde 08/07), essas 2 chamadas de IA nunca ganharam o mesmo tratamento.
- Chamadas Graph API (`Resolver Pasta`, `Resolver Pasta Saída`, `Listar Arquivos`, `Mover Vídeo Processado`, `Listar Arquivos Verificar Fila`) **sem `retryOnFail`** — mesmo já existindo precedente documentado de 504 transitório do OneDrive (08/07/2026).
- `FFmpeg Cortar 9:16` **sem `retryOnFail`**.
- Nenhum node do `Loop Over Items` tem `onError: continueRegularOutput` — comportamento padrão do n8n aborta a execução inteira se 1 clipe falhar (ex: ffmpeg, upload), perdendo os clipes seguintes que cortariam normalmente.
- Workflow sem `executionTimeout` explícito (usa o default da instância) — risco invisível para execuções de 4h+ já observadas na prática.
- `Resolver Pasta Saída` roda em toda execução (inclusive nas ~4x/dia com fila vazia via "A Cada 6 Horas"), buscando um ID de pasta praticamente estático — round-trip evitável.

**Integração:**

- **Chave da API OpenAI hardcoded em texto puro** nos nodes `GPT — Analisar Blocos` e `GPT — Seleção Final` (campo `headerParameters`), em vez de usar uma credential do n8n — fica exposta em exports/histórico de versões do workflow, e rotação exige editar 2 nodes manualmente. Sugestão: migrar para credential `HTTP Header Auth` ou a credential nativa OpenAI do n8n.
- Nenhum `errorWorkflow` configurado (`setWorkflowSettings`) — os vários incidentes reais já documentados neste arquivo (crash de memória, timeouts, lock colidindo) só foram descobertos por investigação manual, às vezes dias depois.
- Nenhuma notificação de conclusão — única forma de saber que shorts novos existem é abrir o OneDrive manualmente, apesar do pipeline rodar 100% autônomo hoje (fila + agendamento de 6h).
- (Ideia de escopo maior, não solicitada) nenhuma integração de publicação direta no YouTube — o fluxo para no OneDrive.

**Positivo confirmado nesta auditoria:** zero execuções com status `error`/`crashed` desde 31/07/2026 (60+ execuções agendadas de fila vazia + as 4 execuções reais de vídeo) — os fixes de trava, memória e wget seguem estáveis em produção.

**Nada foi implementado nesta sessão** — este é só o levantamento, para o usuário priorizar o que aplicar.

---

## Prompts de IA — estrutura PASSO 1 / PASSO 2

**Opção 3 (Blocos)** usa dois passes de IA:
- **1º pass (`sysAnalise`):** IA recebe blocos de ~3min e dá score 0–100. Blocos abaixo de `minBlockScore` são descartados. Desde 12/07/2026, aplica primeiro uma REGRA DE EXCLUSÃO OBRIGATÓRIA: blocos de abertura/boas-vindas, avisos/recados, apelo de dízimos e ofertas, ou louvor/música recebem nota máxima 5, independentemente dos 7 critérios normais — ver seção "Filtro de fase do culto" abaixo.
- **2º pass (`sysFinal`):** IA recebe os blocos aprovados e seleciona os clipes finais com chain-of-thought em 2 passos.

**PASSO 0 — pré-processamento (node "Mesclar Pausas Curtas"):** roda ANTES do PASSO 1, em código (não em prompt). Mescla blocos SRT com gap < 0.5s (respirações) antes da transcrição chegar a qualquer IA. Ver seção "Bug pendente" para detalhes.

**PASSO 1 — PONTOS DE CONCLUSÃO:** a IA lê TODA a transcrição já pré-processada (sem respirações) e mapeia 15–25 momentos onde o pregador conclui um pensamento completo (timestamp + resumo 5 palavras). Como o SRT já vem com pausas curtas mescladas, toda quebra de bloco remanescente já é uma pausa real (≥0.5s) — a IA só precisa decidir se o conteúdo também fecha o raciocínio.

**PASSO 2 — SELEÇÃO DE CLIPES:** para cada clipe, `end` DEVE ser um dos pontos do PASSO 1, entre `start+40s` e `start+180s` (teto absoluto de 180s — ver "Bug corrigido — teto de 180s ignorado pela IA"). Nenhum clipe pode vir de abertura/avisos/dízimo/louvor (ver "Filtro de fase do culto").

**Por que PASSO 1 existe:** whisper.cpp não gera pontuação. Sem isso, a IA cortava em enumerações e vírgulas.

**Regras inegociáveis nos prompts:**
- Nenhum clipe pode vir de abertura, avisos, dízimo/oferta ou louvor — somente da pregação/mensagem principal
- `end` em ponto de conclusão real — NUNCA em enumeração, vírgula ou conjunção
- Duração do clipe (`end - start`) nunca pode ultrapassar 180s
- Cortes em pausas de fala, nunca no meio de palavra
- Clipe autocontido: quem assiste sem contexto entende início, meio e fim
- `conclusions` usa campo `t` (não `start`) — o código de Montar Clipes filtra por `start!=null`
- `start` de cada clipe deve ser **≥10s após o `end` do clipe anterior** — gap mínimo obrigatório

**Proteção de formato de timestamp:** instrução explícita no prompt + salvaguarda no código (veja seção Timestamps).

---

## Limites de duração (sem cap rígido de 90s)

- `MAXEND = clipStart + 180` (silencePrefix — teto absoluto 3min)
- `if (dur < MIN_DUR - 10 || dur > 180) continue` (Montar Clipes)
- `if (clip.start < prevClipEnd + 10) continue` (gap mínimo 10s)
- PASSO 2 (corrigido em 12/07/2026 — ver seção "Bug corrigido — teto de 180s ignorado pela IA"): "o 'end' DEVE ser um dos pontos de conclusão do PASSO 1 que caia ENTRE start+40s E start+180s (nunca antes, nunca depois)". Antes desse fix o prompt dizia "sem teto fixo — capture o raciocínio completo", o que contradizia o `dur > 180` do código e causava clipes descartados silenciosamente.

---

## Parse robusto do JSON da IA (Montar Clipes)

```javascript
let parsed;
try { parsed = JSON.parse(text); }
catch(_) {
  const m = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('IA nao retornou JSON. Resposta: ' + text.slice(0, 400));
  try { parsed = JSON.parse(m[0]); }
  catch(e) { throw new Error('JSON invalido: ' + e.message); }
}
const clips = (() => {
  if (Array.isArray(parsed)) return parsed;
  const c = parsed.clips || parsed.clipes || parsed.cortes;
  if (c) return c;
  const a = Object.values(parsed).filter(v => Array.isArray(v) && v.length > 0 && v[0] && v[0].start != null);
  return a[a.length-1] || [];
})().slice(0, 8);
```

**Opção 3** usa `raw` ao invés de `text` para ler a resposta da IA.

---

## makeAiNode — padrão de node HTTP para IA

Cada chamada de IA usa dois nodes: um Code node ("Preparar X") que monta o objeto de request, e um HTTP Request node que envia.

**Por que `specifyBody:"keypair"`:** `rawBody` e `jsonBody+specifyBody:"string"` falham com expressões longas no n8n — o campo é validado como JSON literal antes da avaliação da expressão. O padrão correto:

```javascript
// Code node ("Preparar X") retorna objeto JS nativo:
return [{ json: { model: 'gpt-5.6-luna', messages: [...] } }];

// HTTP Request node:
specifyBody: "keypair"
bodyParameters.parameters: [
  { name: "model",    value: "={{ $json.model }}" },
  { name: "messages", value: "={{ $json.messages }}" }
]
```

O n8n serializa cada campo com `json:true` internamente, resolvendo todos os problemas de serialização.

---

## Timestamps — conversão de SRT para segundos

O whisper.cpp gera SRT com formato `HH:MM:SS,mmm`. A IA historicamente confundia `MM:SS` com `MM.SS` decimal (ex: `02:04` → `2.04` em vez de `124`).

**Dupla proteção implementada:**

1. **No prompt:** instrução explícita com exemplos de conversão e proibição do formato `MM.SS`.

2. **No Montar Clipes** (salvaguarda de código):
```javascript
const _dur = $('Preparar Whisper Blocos').first().json.duration || 0;
const _maxTs = clips.reduce((m,c)=>Math.max(m,c.end||0),0);
if (clips.length > 0 && _maxTs > 0 && _maxTs < 120 && _dur > 600) {
  clips = clips.map(c => ({...c, start: Math.round(c.start*60*10)/10, end: Math.round(c.end*60*10)/10}));
}
```

---

## Bug corrigido — whisper.cpp em loop de alucinação, engolia pregação inteira sem erro visível (02/09/2026)

**Sintoma:** a execução #1186 (vídeo "Igreja Mahanaim Culto Ao Vivo - 01/09/2026 | Pr. Marcos Xavier.mp4", 96min/5760s) falhou no "Montar Clipes" com `A IA retornou 0 clipes brutos: []`. A execução seguinte (#1221, checagem agendada de 6h) encontrou o mesmo vídeo na fila mas foi bloqueada por uma trava órfã — a #1186 tinha falhado sem passar pelo "Limpar Vídeo Original" (que libera o lock), deixando-o preso apontando pra esse vídeo.

**Diagnóstico inicial (via `get_execution`):** o "Ranking dos Blocos" recebeu apenas 3 blocos no total para os 96 minutos do vídeo (em vez de dezenas de blocos de ~3min, como o design normal produz), todos classificados como `fase:"louvor"`. O SRT bruto revelou a causa: **o bloco 6 sozinho ia de 00:06:42 até o fim do vídeo (01:36:25)** — ou seja, quase 90 minutos inteiros colapsaram em um único segmento de transcrição, contendo a frase "Não há ninguém igual a Ti, Deus" repetida **centenas de vezes seguidas**, terminando com um rodapé fantasma "Legenda por Sônia Ruberti" (uma assinatura de legendagem que o Whisper inventa — hallucination conhecida do modelo, nunca esteve no áudio real).

**Investigação — havia pregação real perdida?** Para responder isso sem re-processar o vídeo inteiro (whisper.cpp já tinha rodado uma vez, ~2h+), usou-se a técnica de node temporário (Execute Command, ver seção "Conexão MCP com n8n") para extrair e transcrever manualmente 6 amostras isoladas de 3 minutos, nos minutos 15/30/45/60/75/90 do `audio_full.wav` ainda presente na VPS (não limpo por causa da falha). Resultado — **cada amostra, transcrita isoladamente, capturou conteúdo real e coerente, completamente diferente da frase alucinada**:

| Minuto | Conteúdo real (transcrito isoladamente) |
|---|---|
| 15 | Louvor (canção de adoração distinta) |
| 30 | Apelo de dízimo/oferta + oração pastoral |
| 45 | **Pregação real** — Adão e Eva, obediência a Deus |
| 60 | **Pregação real** — história de Lázaro (João 11), Marta, "eu sou a ressurreição e a vida" |
| 75 | **Pregação real, clímax emocional** — "Lázaro, sai pra fora!", apelo direto ao público |
| 90 | Louvor de encerramento |

Isso confirmou uma pregação real e substancial (~45 min de conteúdo, sobre a ressurreição de Lázaro) que nunca chegou a nenhuma das duas IAs — a transcrição principal nunca a capturou porque o bloco 6 alucinado a engoliu inteira.

**Causa raiz:** o whisper.cpp, por padrão, usa a transcrição já gerada como contexto/prompt para decodificar a próxima janela de áudio (`--max-context`/`-mc`, default `-1` = ilimitado — documentado no `--help` do binário, não citado na doc original do projeto). Esse mecanismo existe para dar coerência entre janelas (nomes próprios, terminologia consistente), mas tem um efeito colateral conhecido em transcrição longa: se o modelo aluciona uma vez (mais provável em trechos com música de fundo contínua sobreposta à fala — cama instrumental típica de cultos carismáticos, que pode confundir o VAD/decoder), essa alucinação vira o contexto da próxima janela, reforçando a mesma saída errada — um loop que se autoalimenta e nunca se recupera sozinho, mesmo quando o áudio real muda completamente de conteúdo (louvor → dízimo → pregação → outro louvor, como confirmado pelas amostras isoladas acima). Cada amostra isolada funcionou bem justamente por não carregar esse contexto contaminado.

**Fix validado antes de aplicar:** testado diretamente na VPS via node temporário, uma transcrição contínua de 30 minutos (minuto 5–35, span que inclui o ponto exato onde a produção travou) com a flag `-mc 0` adicionada ao comando. Resultado: segmentação granular (segundos, não mais um bloco de 90min) e conteúdo coerente com a progressão real do culto (louvor até ~19min → avisos/boas-vindas a visitantes → apelo de dízimo a partir de ~19min), **sem nenhuma repetição degenerada** em nenhum ponto dos 30 minutos testados. A flag `-nc`/`--no-context` (nome usado por outras implementações de Whisper, como openai-whisper/faster-whisper) **não existe nesta build do whisper.cpp** — confirmado via `whisper --help`; o parâmetro equivalente aqui é `-mc N`/`--max-context N`, e `0` desliga o carregamento de contexto entre janelas.

**Aplicado (nos três lugares — n8n via MCP + `publish_workflow`, `n8n-video-silence-cutter.html`, `workflow-blocos.json`):** `-mc 0` adicionado ao comando do whisper.cpp em "Whisper.cpp Transcrever" (transcrição completa, sempre ativo) e no node dormente "Whisper.cpp Transcrever Clipe" (sub-pipeline de legenda, desabilitado desde 08/07/2026, mantido por consistência caso seja reativado no futuro — este node só existe no HTML, não em produção nem em `workflow-blocos.json`, que já não o incluem desde a remoção das legendas).

**Trade-off aceito conscientemente:** sem o contexto entre janelas, a decodificação fica mais lenta — o teste de 30min de áudio levou ~43 minutos de processamento (mais lento que tempo real), contra uma expectativa de poucos minutos com o `large-v3-turbo` em condições normais (contexto ligado permite ao decoder "atalhar" trechos previsíveis). Ainda assim, isso é compatível com a escala de horas já observada para o pipeline completo (a maior parte do tempo de execução sempre foi dominada pelo whisper.cpp mesmo antes deste fix) — não foi feita nenhuma tentativa de mitigar essa lentidão adicional (ex: religar contexto só depois de N minutos, ou detectar e reiniciar o contexto quando uma repetição é percebida), por ser fora do escopo do bug relatado.

**Por que isso não apareceu antes:** a maioria dos vídeos do projeto aparentemente não tem esse padrão específico de música contínua sobreposta à fala (ou tem, mas nunca disparou uma alucinação longa o suficiente para ser percebida) — é o primeiro caso documentado deste modo de falha específico entre os ~250+ execuções já registradas no histórico do n8n. Não é impossível que alguns dos casos antigos de "poucos clipes gerados" ou "bloco gigante" já documentados (ex: "Fique Atento à Oportunidade", 09/07/2026, bloco de quase 20min; ou o "bloco gigante" da execução #246, 22/08/2026) tenham a mesma causa raiz subjacente (fala contínua sem pausas detectáveis pelo whisper.cpp) sem terem sido investigados a esse nível de profundidade — vale ter esse fix em mente se o padrão "bloco anormalmente longo" se repetir no futuro, mesmo que a causa até agora sempre tenha sido atribuída só a "o pregador fala sem pausas".

**✅ Validado com execução real (execução #1291, ver "Estado atual" no topo do arquivo para o relato completo):** o vídeo travou pelo bug original (Lázaro) foi reprocessado do zero via Schedule Trigger e completou com sucesso, gerando 6 clipes — incluindo um clipe cujo hook ("Abre a sua Bíblia comigo João capítulo 11") confirma que a pregação de Lázaro chegou corretamente às duas IAs desta vez. (b) Tempo total: 2h41min de ponta a ponta (download + whisper.cpp `-mc 0` + 2 passes de IA + corte de 6 clipes) — dentro da escala de horas já observada para o pipeline, não virou um problema prático.

---

## Bugs resolvidos — não regredir

| Bug | Causa | Fix |
|-----|-------|-----|
| Silêncio nunca estendia | `AEND = OEND + SRAW` — somava offset absoluto | Usar `SRAW` diretamente como timestamp |
| Pausas de respiração detectadas | `duration=0.4` capturava micro-pausas | Mudar para `duration=0.3` + buscar `silence_end` |
| Só 1 clipe retornado | PASSO 1 mapeava segmentos temáticos | Mudar para pontos de conclusão (15–25 endpoints) |
| "Montar Clipes não retornou nada" | Chave `"clipes"` em PT + regex greedy | Parse try/catch + fallback multi-chave |
| Clipe cortado no meio de frase | Cap de 90s sem extensão por silêncio | silencePrefix + PASSO 2 com `end` em ponto de conclusão real, respeitando o teto de 180s (ver bug do teto de 180s abaixo) |
| Timestamps em minutos (2.04 em vez de 124.1) | GPT lia `MM:SS` como `MM.SS` decimal | Instrução no prompt + salvaguarda ×60 no Montar Clipes |
| "you must provide a model parameter" | `rawBody`/`jsonBody` não serializam expressões | `specifyBody:"keypair"` + Code node retorna objeto JS nativo |
| Clipes contíguos com sobreposição | start de N = end de N-1; silencePrefix estendia para dentro do N | Prompt exige gap ≥10s; Montar Clipes filtra `clip.start < prevClipEnd + 10` |
| Montar Clipes retornou vazio sem erro (caso 1) | Timestamps 6.2–62.5 disparavam salvaguarda ×60 incorretamente, gerando durações >180s | Âncora de duração no prompt + throw explícito com debug info |
| Montar Clipes: 8 clipes válidos mas todos nos primeiros 132.6s de vídeo de 2529.6s | Viés de atenção da IA em transcrições longas — instrução em prosa ("distribua ao longo do vídeo") foi ignorada | Checklist obrigatório de 6 janelas de tempo calculadas programaticamente, com regra de "pare e releia" + mínimo de 4 janelas diferentes nos clipes finais |
| `update_workflow`/`get_workflow_details` retornando "Workflow not found" para `OrnUHDqFiUlN82Wt` | Provável exclusão/consolidação manual do duplicado pelo usuário no n8n (não confirmado) | Padronizar em `ID4wisnN4Tqpt2zh`, único workflow retornado por `search_workflows` e com `availableInMCP:true` |
| Montar Clipes: 8 clipes válidos (232-382s cada) mas zero aprovados, vídeo de 7725s | Prompt `sysFinal` dizia "sem teto fixo" no PASSO 2, mas o código sempre teve `dur > 180` como filtro rígido — mismatch prompt/código | Prompt agora informa o teto de 180s explicitamente em 4 pontos (DURAÇÃO IDEAL, PASSO 1, PASSO 2, REGRAS INEGOCIÁVEIS); mensagem de erro do Montar Clipes agora diagnostica a causa real em vez de texto genérico |
| "Baixar Vídeo" crashou com NodeCrashedError / out-of-memory | Node nativo `microsoftOneDrive` (download) carrega o arquivo inteiro na memória do processo Node.js antes de gravar em disco — vídeos de vários GB (10.07GiB/7.82GiB) estouram a memória disponível | Substituído por Execute Command com `wget` usando a URL de download direta (`@microsoft.graph.downloadUrl`), gravando direto no disco via streaming, sem passar pela memória do n8n |
| `curl: not found` no "Baixar Vídeo" | VPS roda Alpine hardened (Docker Hardened Images v3.24), que não inclui `curl` nem `python3` — só `wget` | Comando trocado de `curl -L --fail --retry...` para `wget -q --tries=5 --waitretry=10 -O...` |
| 2 execuções simultâneas travadas 17h+ sem completar nem o 1º node | 2 processos whisper.cpp `large-v3` brigando pelos mesmos 6 núcleos da VPS (`-t 6` por execução) | Lock de arquivo (`/home/node/.n8n-files/.processing.lock`) entre "Selecionar Vídeo" e "Baixar Vídeo", com expiração de 8h |
| "Ranking dos Blocos": todos os 18 blocos com nota 5, inclusive 17 marcados `fase:"pregacao"` pela própria IA | IA zerou os 7 critérios e aplicou a nota-teto de exclusão (5) mesmo a blocos que ela classificou como pregação legítima — atalho degenerado em vídeo de fala muito contínua | Prompt `sysAnalise` ganhou regra de consistência numérica (score = soma dos criteria); código de "Ranking dos Blocos" agora força `score=0` para blocos com `fase != "pregacao"` (exclusão determinística, não depende só do prompt) |
| `_meta.json` nunca aparecia no OneDrive (pasta só tinha `.mp4`) | Node "Upload Metadados → OneDrive" não respeita o parâmetro `fileName` — usa o nome do arquivo LOCAL (sempre `clip_XX_meta.json`, genérico e igual em todo vídeo), sobrescrevendo os mesmos ~8 arquivos desde 08/07 | `metaPath` local em "Montar Clipes" passou a usar o mesmo padrão final do `outPath` (`short_XX_slug_meta.json`), alinhando nome local ao nome desejado — corrige independente do node respeitar ou não o parâmetro `fileName` |
| Tentativa de baixar `ggml-large-v3-turbo.bin` para `/models/` falhou com `Permission denied` | `/models/` pertence a `root:root`, sem escrita para o usuário `node` (uid 1000) que roda o n8n — modelo antigo foi colocado lá manualmente via acesso root/SSH, fora do fluxo do workflow | Modelo novo baixado via `wget` para `/home/node/.n8n-files/ggml-large-v3-turbo.bin` (pasta já gravável e já usada pelo pipeline) em vez de `/models/`; comando do whisper apontado para o novo caminho |
| Nome do pregador ausente no `reason`/nome do arquivo para Miss./Ap./Pb./Bispo (só "Pr."/"Pra." funcionava) | Regex em "Montar Clipes" só cobria os prefixos `Pr\.?a?\.?` | Regex ampliada para `(?:Pr\.?a?\.?\|Miss\.?\|Pb\.?\|Ap\.?\|Bispo\.?)` |
| "Aplicar Trava" marcava a execução inteira como `error` em toda colisão de lock (Schedule Trigger vs. self-chaining) | Mesma classe de bug já corrigida em 20/07 para fila vazia, mas não replicada aqui — `throw new Error(...)` mesmo sendo um resultado esperado/seguro | Lock ocupado agora retorna `{lockAcquired:false, lockMessage}` em vez de lançar erro; novo node IF "Trava Liberada?" decide se segue (true) ou para sem erro (false), mesmo padrão do "Vídeo Encontrado?" |
| `criteria` do `_meta.json` sempre `null`, mesmo quando `block_score` existia | "Ranking dos Blocos" nunca copiava o `criteria` retornado pela IA para dentro de `scoredBlocks` | `scoredBlocks` agora inclui `criteria: s.criteria \|\| null` |
| Rendimento de clipes despencava quando o fallback do "Ranking dos Blocos" era acionado (execução #78: 1 clipe em vez de 5-8) | Prompt de seleção final rotulava blocos de baixa nota como "Melhores blocos" com o número anexado (ex: "nota: 5/100") — sinal contraditório que pode ter deixado a 2ª IA mais conservadora | Nota omitida quando `usedFallback` (rótulo "candidato - sem nota confiável"); parágrafo de aviso explícito injetado no `userContent` quando `blockScoringFallback` |
| Extensão do `end` por silêncio (`silencePrefix`) nunca funcionava de verdade (confirmado: duração real dos clipes = `end-start` do meta, sem nenhuma extensão aplicada) | `awk` usava `$NF` (último campo) para extrair o timestamp de `silence_end`, mas a linha real do ffmpeg é `silence_end: X \| silence_duration: Y` — `$NF` pegava `Y` (duração, tipicamente <3s), quase nunca maior que `OEND` (centenas/milhares de segundos) | `awk` reescrito para localizar o token `silence_end:` e pegar o campo seguinte, imune ao sufixo `\| silence_duration:` |
| Threshold de silêncio fixo em `-30dB` não detectava pausas reais em ~45% dos clipes auditados | Piso de ruído ambiente varia de -13dB a -25dB entre gravações — acima do threshold fixo, que nunca disparava | `noiseThreshold` calculado por vídeo via `volumedetect` (`mean_volume - 12dB`, faixa `[-40,-18]`), propagado por todo o pipeline até "FFmpeg Cortar 9:16" |
| `start` do clipe nunca tinha nenhuma correção por silêncio (só o `end` era estendido) | Assimetria de design original — `silencePrefix` só existia para o fim | Novo snap simétrico (`ASTART`): busca o `silence_end` mais próximo numa janela de até 15s antes do `clipStart`, com fallback pro valor original se nada for encontrado |
| Snap de silêncio por clipe podia gerar sobreposição real de conteúdo entre 2 Shorts (execução #143: clip2/clip3 com -2.46s de overlap) | `ASTART`/`AEND` de cada clipe são calculados isoladamente por item do loop, sem noção de onde o vizinho ficou após o próprio ajuste — o gap mínimo bruto de 10s podia ser consumido inteiro pela extensão | Clamp determinístico usando `prevClipEnd`/`nextClipStart` (bruto) + `MINGAP=5`, cai de volta no timestamp bruto da IA se o ajuste ultrapassaria o vizinho; gap mínimo bruto subiu de 10s para 15s como margem extra (31/07/2026) |
| Clamp de colisão (31/07/2026) ainda permitia gap real abaixo do piso de 5s em casos reais (auditoria 17/08/2026: 4.74s, Pr. Hiro Delgado clip4→clip5) | O clamp de `ASTART` comparava só contra `prevClipEnd` BRUTO do vizinho, nunca contra o `real_end` já ajustado dele — os dois lados podiam erodir um em direção ao outro simultaneamente e passar despercebidos | `.prev_clip_real_end` (arquivo de estado, sobrescrito a cada clipe): persiste o `AEND` real do clipe anterior entre iterações sequenciais do `Loop Over Items`, e o clamp do próximo clipe usa esse valor real em vez do bruto (fallback pro bruto se ausente/1º clipe). Sentido "para frente" (`NEXTSTART`) continua bruto — limitação aceita, ver change `harden-block-pipeline-reliability` (22/08/2026) |
| whisper.cpp engolia ~90min de pregação real (Lázaro, João 11) num loop de alucinação repetindo a mesma frase de louvor, sem erro visível — 2ª IA retornava 0 clipes (execução #1186, 02/09/2026) | Contexto entre janelas do whisper.cpp ligado por padrão (`--max-context` default `-1` = ilimitado) — uma alucinação numa janela vira prompt da próxima e o loop se autoalimenta indefinidamente, especialmente com música de fundo contínua durante a fala | Flag `-mc 0` adicionada ao comando whisper.cpp (desliga o contexto entre janelas). Validado manualmente na VPS: re-transcrição de 30min do trecho problemático com `-mc 0` produziu segmentação granular e coerente, sem loop |

---

## Conexão MCP com n8n (a partir de 07/07/2026)

O usuário conectou o n8n diretamente via MCP nesta sessão. Isso significa que, a partir de agora, fixes podem ser aplicados **diretamente no workflow em produção** usando `update_workflow` (operações atômicas: `updateNodeParameters`, `setNodeParameter`, `addNode`, `addConnection` etc.), sem precisar do fluxo manual de "editar HTML → gerar JSON → reimportar no n8n".

**Como usar `update_workflow` corretamente (aprendido nesta sessão):**
- A operação `setNodeParameter` espera `path` como **JSON Pointer relativo aos parameters do node** (ex: `/jsCode`), mas na prática o path `"jsCode"` e `"parameters.jsCode"` retornaram erro `"invalid or contains unsafe segments"`. **O que funcionou de fato foi a operação `updateNodeParameters`**, passando `{ nodeName: "...", parameters: { jsCode: "..." }, replace: false }` — essa é a forma recomendada para substituir o conteúdo de um Code node inteiro.
- `nodeName` é o campo correto para identificar o node (não `nodeId`, apesar do node ter um `id` interno no JSON).

**Workflow padrão do projeto:** `ID4wisnN4Tqpt2zh` — nome "YouTube Shorts — Blocos (GPT-4o × 2 passes + Whisper.cpp local)". `availableInMCP: true`.

**Descoberta importante — "Retry" do n8n não revalida mudanças em nodes HTTP Request (13/07/2026):** ao tentar validar o segundo fix do bug de scoring degenerado (ver seção "Bug corrigido — IA zerava criteria..."), o usuário usou o botão "Retry" na execução #42 (que tinha falhado no "Ranking dos Blocos") esperando que isso rechamasse a IA com o prompt já corrigido. Resultado: a execução de retry (#43, depois #44 como retry de #43) falhou em ~40-75ms com a mensagem de erro **idêntica, palavra por palavra**, à da execução original. Investigando via `get_execution`, o `runData` da execução de retry continha o node `"GPT — Analisar Blocos"` com a **mesma resposta da API já registrada na execução original** — ou seja, o Retry do n8n reaproveita (pina) os dados de saída de TODOS os nodes que já haviam sido executados com sucesso antes do ponto de falha, **incluindo nodes HTTP Request como as chamadas de IA**, e só re-executa a partir do node que falhou (`Ranking dos Blocos`, um Code node). Isso significa que qualquer fix que dependa de uma nova chamada à IA (mudança de prompt, por exemplo) **nunca é testado por um Retry** — o Retry só é útil para validar fixes em nodes de código/lógica que ficam DEPOIS do ponto de falha, reaproveitando chamadas de API caras (whisper.cpp, GPT) que não mudaram. **Lição:** antes de recomendar "usa o Retry" ao usuário, verificar se o fix aplicado está em um node ANTES ou DEPOIS do ponto de falha original — se estiver antes (como um prompt de uma chamada de IA que já rodou), só uma execução nova (`execute_workflow` do zero) realmente testa a mudança.

**Divergência encontrada e corrigida (07/07/2026):** ao verificar `ID4wisnN4Tqpt2zh` via `get_workflow_details` após aplicar o fix do checklist, notei que os dois nodes de Whisper.cpp ("Whisper.cpp Transcrever" e "Whisper.cpp Transcrever Clipe") estavam com o modelo `ggml-large-v3.bin` mas **sem a flag `-t 6`** de threads — só o HTML/JSON locais tinham essa flag. Ou seja, o upgrade de VPS (6 núcleos/18GB) documentado antes nesta sessão nunca tinha chegado ao workflow real em produção. Corrigido via `update_workflow` nos dois nodes. **Lição:** depois de qualquer fix "aplicado nesta sessão" via MCP, vale conferir com `get_workflow_details` se o conteúdo bate 100% com o que o HTML/JSON locais descrevem — nem sempre os três (n8n, HTML, JSON) estavam em sincronia antes desta sessão.

**Incidente do workflow duplicado (06–07/07/2026):** por algum motivo (provavelmente reimportações manuais anteriores) existiam **dois workflows com o mesmo nome** no n8n: `OrnUHDqFiUlN82Wt` e `ID4wisnN4Tqpt2zh`. O primeiro fix desta sessão foi aplicado em `OrnUHDqFiUlN82Wt` (o único com `availableInMCP:true` no momento). Depois, ao investigar um erro de execução, descobriu-se que todo o **histórico real de execuções** (inclusive o erro que estava sendo debugado) pertencia a `ID4wisnN4Tqpt2zh` — ou seja, o usuário estava rodando o workflow errado (o que eu não tinha atualizado) em produção. Perguntado, o usuário escolheu explicitamente manter `OrnUHDqFiUlN82Wt`. Pouco depois, porém, `OrnUHDqFiUlN82Wt` começou a retornar `"Workflow not found or you don't have permission to access it."` em `update_workflow` e `get_workflow_details`, e sumiu completamente dos resultados de `search_workflows` — restando apenas `ID4wisnN4Tqpt2zh` (agora com `availableInMCP:true`, o que antes não era o caso). **A causa exata não foi confirmada nesta sessão** (mais provável: o usuário excluiu/consolidou o duplicado manualmente no n8n, possivelmente em resposta à própria pergunta sobre qual manter — mas sem confirmação explícita). Diante disso, o trabalho passou a ser feito em `ID4wisnN4Tqpt2zh`, que já continha (confirmado via `get_workflow_details`) todos os fixes anteriores: PASSO 0 ("Mesclar Pausas Curtas"), âncora de duração, throw explícito no "Montar Clipes", modelo `ggml-large-v3.bin` + `-t 6`. **Se o usuário voltar a ver dois workflows com o mesmo nome no n8n, vale apagar manualmente o duplicado antigo para evitar reincidência deste problema.**

---

## Trava de execução sequencial — 2 vídeos competindo pela VPS (13/07/2026)

**Sintoma:** para validar o filtro de fase, disparei a execução #26 (via `execute_workflow` MCP, vídeo do Pr. Rodnei Romano, o mesmo que a execução #25 já tinha processado). O usuário, quase ao mesmo tempo, adicionou um segundo vídeo à pasta de entrada e disparou a execução #27. As duas ficaram com status `running` por mais de 17 horas sem completar **nem o primeiro node** do workflow (a chamada HTTP "Resolver Pasta", que normalmente leva segundos) — verificado via `get_execution` com `includeData:true`, que retornou `runData: {}` (vazio) para a #26 depois de 17h+.

**Causa raiz:** o node "Whisper.cpp Transcrever" roda com a flag `-t 6` fixa (usa todos os 6 núcleos da VPS, upgrade documentado em 06/07/2026). Com 2 execuções simultâneas, são 2 processos `whisper.cpp large-v3` disputando os mesmos 6 núcleos ao mesmo tempo (12 threads concorrendo por 6 núcleos físicos) — o overhead de troca de contexto entre processos CPU-bound faz as duas execuções ficarem drasticamente mais lentas do que rodar uma de cada vez, em vez de simplesmente levarem o dobro do tempo. O workflow nunca foi desenhado para suportar paralelismo — sempre assumiu que só uma execução estaria ativa por vez.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):** implementado um lock de arquivo simples, baseado em timestamp, entre os nodes "Selecionar Vídeo" e "Baixar Vídeo":

1. **Node novo "Verificar Trava de Execução"** (Execute Command): checa se existe `/home/node/.n8n-files/.processing.lock`. Se existir e tiver menos de 8h (`MAX_AGE=28800` segundos), imprime `STATUS:LOCKED` + o conteúdo do lock (nome do vídeo em processamento + timestamp de início) + a idade do lock em segundos, e sai com código 0 (não falha o node — a decisão de bloquear é feita no próximo node, para poder lançar uma mensagem de erro customizada e legível). Se o lock não existir, ou já tiver mais de 8h (considerado abandonado/travado), cria/sobrescreve o lock com `{{ $json.name }}|timestamp` e imprime `STATUS:ACQUIRED`.
2. **Node novo "Aplicar Trava"** (Code): lê o stdout do node anterior. Se `STATUS:LOCKED`, lança um `Error` explicando que outra execução já está processando outro vídeo, há quanto tempo, e o que fazer (aguardar ~5h, ou apagar o lock manualmente na VPS se tiver certeza de que é um lock travado). Se não estiver locked, segue normalmente repassando os dados do "Selecionar Vídeo".
3. **"Limpar Vídeo Original"** (o node de limpeza que já existia, disparado quando o `Loop Over Items` termina todos os clipes) agora também remove `/home/node/.n8n-files/.processing.lock` como parte do `rm -f`, liberando a trava para a próxima execução.

**Por que expiração de 8h em vez de trava permanente:** se uma execução falhar no meio do processo (erro de API, FFmpeg, timeout de rede etc.), ela nunca chega ao "Limpar Vídeo Original" — que fica depois de todo o pipeline de corte — e o lock ficaria travado para sempre, bloqueando todas as execuções futuras até alguém apagar o arquivo manualmente. Uma execução bem-sucedida leva ~5h (baseado na execução #25); 8h dá margem confortável sem deixar o sistema travado por dias se algo falhar.

**Limitação conhecida (aceita conscientemente, dado o escopo do pedido):** a trava só é liberada no caminho de sucesso ("Limpar Vídeo Original"), não em um error-handler dedicado do n8n — não implementei um workflow de erro separado para isso, que seria mais robusto mas também mais complexo. Se uma execução falhar, a trava fica ocupada até expirar sozinha em 8h (ou até alguém apagar `/home/node/.n8n-files/.processing.lock` manualmente na VPS). Isso é consistente com o padrão pragmático do resto do projeto — vale revisar se falhas parciais com lock travado se tornarem um problema recorrente.

**Ainda não testado com uma reexecução real** — falta rodar 2 execuções em sequência para confirmar que a segunda é corretamente bloqueada com a mensagem de erro esperada enquanto a primeira está em andamento.

---

## Execução #51 — sucesso end-to-end, valida o fallback do Ranking dos Blocos (14/07/2026)

**Resultado:** a execução #51 (disparada do zero após limpar o lock deixado pela #47) **completou com sucesso** todo o pipeline, do download até o upload dos shorts no OneDrive. Diferença importante em relação às 3 tentativas anteriores (#35, #42, #47): desta vez o vídeo processado foi **"Culto Ao Vivo - 07/07/2026 | Pr. Rodnei Romano_1080p.mp4"** (4.6GB, reencode 1080p, upload feito em 14/07/2026), não o arquivo 4K de 10GB original usado nas tentativas anteriores — o arquivo 4K original não está mais presente na pasta.

**Scores da 1ª IA desta vez vieram genuinamente diferenciados:** 52, 57, 54, 49 para blocos de conteúdo real de pregação, e 4 para um trecho de louvor repetitivo (corretamente excluído). Isso confirma que o fallback estrutural (Ranking dos Blocos não trava mais o pipeline, ver seção "Terceira falha consecutiva" acima) funcionou exatamente como projetado — mas também que, desta vez, nem foi necessário cair no caminho de fallback: a 1ª IA conseguiu pontuar o conteúdo normalmente. 7 clipes finais foram gerados e enviados ao OneDrive.

**Questão em aberto, não investigada:** não está confirmado se o reencode para 1080p (bitrate/áudio diferentes do 4K original) contribuiu para a IA finalmente produzir notas diferenciadas, ou se foi simplesmente uma execução "de sorte" do modelo. As 3 falhas anteriores usaram o arquivo 4K original; esta única execução bem-sucedida usou o reencode 1080p — amostra pequena demais para conclusão, mas vale observar se o padrão se repete (arquivos 4K brutos de câmera tendendo a scores degenerados vs. reencodes mais compactos tendendo a scores normais) em execuções futuras.

---

## Fila automática — loop sequencial + arquivamento de vídeos processados (14/07/2026)

**Pedido do usuário:** identificar todos os vídeos na pasta de entrada e processá-los sequencialmente em loop — ao concluir o pipeline de um vídeo, iniciar automaticamente o próximo, até não haver mais vídeos pendentes — e mover cada vídeo original para `Videos-Cortes/Videos` assim que seu pipeline terminar (para não ser reprocessado).

**Implementação (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):** 4 nodes novos encadeados após "Limpar Vídeo Original" (que já roda no caminho de sucesso, ao final do `Loop Over Items`):

1. **"Mover Vídeo Processado"** (httpRequest, PATCH): move o vídeo original recém-processado para `/drive/root:/Videos-Cortes/Videos` via Microsoft Graph API (`PATCH /me/drive/items/{id}` com `parentReference.path`) — usa o `id` capturado em "Selecionar Vídeo" no início da execução. Path-based, não precisa do ID da pasta de destino hardcoded.
2. **"Listar Arquivos (Verificar Fila)"** (httpRequest, GET): relista os arquivos da pasta raiz de entrada (mesma chamada que "Listar Arquivos" já fazia no início do pipeline) para ver o que sobrou depois que o vídeo processado saiu dali.
3. **"Decidir Próximo Vídeo"** (Code): aplica o mesmo filtro de "Selecionar Vídeo" (extensão de vídeo + tamanho mínimo 1MB) sobre a nova listagem. Se sobrar pelo menos 1 vídeo elegível, retorna um item com `nextVideoName`/`nextVideoCount`; se não sobrar nenhum, **retorna `[]`** — um array vazio de itens naturalmente interrompe a cadeia (o próximo node não roda com 0 itens), terminando o loop sem nenhum erro.
4. **"Disparar Próximo Vídeo"** (`n8n-nodes-base.executeWorkflow`, v1.3): chama o **próprio workflow** (`workflowId: ID4wisnN4Tqpt2zh`) de forma assíncrona — o parâmetro crítico é `options.waitForSubWorkflow: false`, que faz a chamada ser "dispare e esqueça" (fire-and-forget) em vez de bloquear a execução atual esperando o próximo vídeo terminar (que levaria mais 3-5h). Isso permite que a execução atual finalize rapidamente logo após disparar a próxima, em vez de ficar "presa" aguardando toda a cadeia.

**Por que self-chaining em vez de um loop nativo do n8n:** o `splitInBatches` ("Loop Over Items") já usado no pipeline itera sobre *itens dentro de uma única execução* (os clipes de um vídeo) — não serve para encadear *execuções inteiras* separadas por vídeo, porque cada vídeo precisa passar por download, whisper.cpp e as 2 chamadas de IA do zero, e queremos que cada vídeo tenha sua própria execução isolada no histórico do n8n (mais fácil de debugar) em vez de uma única execução gigante processando todos os vídeos em sequência interna. Encadear via `executeWorkflow` (chamando a si mesmo) resolve isso: cada vídeo = 1 execução completa e independente, visível separadamente em `search_executions`.

**Efeito colateral desejado — a trava de execução sequencial (seção acima) continua protegendo mesmo com o self-chaining:** como o novo vídeo é disparado só depois que "Limpar Vídeo Original" já rodou (que também é o node que libera o lock, `rm -f .processing.lock`), a nova execução parte com o lock já livre — sem risco de a execução recém-disparada se autobloquear. E como o disparo é sequencial (uma finaliza antes de disparar a próxima), nunca há 2 vídeos concorrendo pelos 6 núcleos da VPS ao mesmo tempo — o problema original que motivou a trava (seção "Trava de execução sequencial") continua resolvido, agora de forma automática em vez de depender do usuário disparar manualmente vídeo por vídeo.

**Pegadinha de credenciais do MCP do n8n (aprendida nesta sessão):** ao criar um node HTTP Request novo via `update_workflow` com a operação `addNode`, passar um bloco `credentials: {...}` diretamente dentro do objeto `node` **não é suficiente** — o `update_workflow` retorna sucesso (`appliedOperations` correto) mas inclui um aviso separado (`"note": "HTTP Request nodes (...) were skipped during credential auto-assignment. Their credentials must be configured manually."`) informando que a credencial não foi de fato anexada. A forma que funciona é uma operação **`setNodeCredential`** separada, DEPOIS do `addNode`:
```
{ type: "setNodeCredential", nodeName: "Nome do Node", credentialKey: "microsoftOneDriveOAuth2Api", credentialId: "dpECDcyJI0Z5iKax", credentialName: "Microsoft Drive account" }
```
Isso foi confirmado 2 vezes nesta sessão: nos nodes "Mover Vídeo Processado"/"Listar Arquivos (Verificar Fila)" (o aviso desapareceu da resposta só depois do `setNodeCredential`) e depois de novo num node temporário criado só para diagnóstico. **Lição para o futuro:** sempre que criar um node HTTP Request via `addNode` que precise de credencial (`nodeCredentialType`), assumir que vai ser necessário um `setNodeCredential` complementar — não confiar no bloco `credentials` inline do `addNode`, mesmo que a API aceite esse campo sem erro de validação.

**Descoberta sobre o estado real das pastas (14/07/2026) — a pasta raiz `Videos-Cortes` e a subpasta `Videos-Cortes/Videos` não têm o relacionamento simples que eu assumi:** ao verificar a fila via uma chamada Graph API temporária (mesma técnica de node temporário já documentada na seção "Conexão MCP com n8n"), descobri que:
- A pasta raiz `Videos-Cortes` (a que o pipeline varre para decidir qual vídeo processar) está **vazia de vídeos** no momento — só contém as 4 subpastas (`Cortes` = saída dos shorts, `Finalizado`, `Transcricao`, `Videos`).
- A subpasta `Videos-Cortes/Videos` (destino da nova feature de arquivamento) **já existia antes desta sessão** (criada em 29/06/2026) e já continha 7 arquivos de vídeo, com um perfil misto: o vídeo do Pr. Rodnei Romano recém-processado pela execução #51 (já estava lá, provavelmente movido manualmente pelo usuário), o vídeo do Pr. Daniel dos Santos (12/07, **ainda não processado**, sem shorts gerados), 2 vídeos de sermões antigos já processados em sessões anteriores, e 2 vídeos completamente sem relação com o projeto (um podcast sobre carros, um vídeo de música).
- Como o pipeline só varre os filhos diretos da raiz `Videos-Cortes` (não entra em subpastas), o vídeo do Pr. Daniel dos Santos, estando dentro de `Videos-Cortes/Videos`, **nunca seria encontrado automaticamente** pela nova feature de fila — mesmo estando pronto para processar.
- **Perguntado ao usuário se queria mover esse vídeo de volta para a raiz (para o loop pegá-lo automaticamente), o usuário optou por "Deixar como está"** — ou seja, o usuário mantém controle manual sobre quando e quais vídeos entram na fila da raiz `Videos-Cortes`, e a pasta `Videos-Cortes/Videos` parece ter um uso mais amplo (mistura vídeos já processados, vídeos ainda não processados e conteúdo sem relação com o projeto) do que a hipótese simples de "arquivo só de vídeos já cortados". **Não foi feita nenhuma mudança na organização das pastas** — a feature de mover-após-processar continua funcionando exatamente como pedido (move o vídeo original para `Videos-Cortes/Videos` ao final do pipeline), só a suposição de que essa pasta serviria também como fonte automática de novos vídeos foi descartada.

**Validado com execução real — execução #61 → #62 (16/07/2026):** a execução #61 (vídeo "Não Deu Errado, Foi Livramento - 16/06/2026 | Pr. Flávio Souza", rodou das 17:45 às 20:47 UTC, ~3h) completou o pipeline inteiro com sucesso — 8 clipes gerados, `Mover Vídeo Processado` moveu o original para `Videos-Cortes/Videos` (`executionStatus:"success"`), `Decidir Próximo Vídeo` encontrou 2 vídeos restantes na raiz e escolheu o próximo ("Não viva somente no natural, viva o sobrenatural — Stephany Barros"), e `Disparar Próximo Vídeo` disparou a execução #62 com sucesso. **A cadeia de self-chaining funciona exatamente como projetado**, confirmado pelo usuário observando o comportamento em produção.

**Mas a execução #62 (o vídeo disparado automaticamente) crashou** no node "Whisper.cpp Transcrever" com `NodeCrashedError` ("n8n may have run out of memory"), logo depois de "Baixar Vídeo" (124s) e "FFprobe + Extrair Áudio" (35.5s) terem sucesso. **Causa provável: não foi um problema da feature de fila em si, e sim uma colisão com trabalho de sessão concorrente** — no momento exato em que a #62 rodava (20:47–20:50 UTC), eu estava editando o mesmo workflow ao vivo via `update_workflow` (adicionando/removendo nodes temporários de diagnóstico para a troca do modelo whisper, incluindo uma mudança nos parâmetros do próprio node "Whisper.cpp Transcrever") como parte da tarefa de trocar o modelo para `large-v3-turbo`. Modificar a definição de um workflow (`addNode`/`removeNode`/`updateNodeParameters`) enquanto uma execução está ativamente passando por ele é arriscado — pode desestabilizar o motor de execução do n8n, o que bate com o padrão observado (crash abrupto tipo OOM, não um erro de comando normal como "model not found").

**Efeito colateral do crash — lock órfão:** como a #62 crashou antes de chegar em "Limpar Vídeo Original" (o node que libera `/home/node/.n8n-files/.processing.lock`), o lock ficou preso referenciando o vídeo da Stephany Barros, o que bloquearia qualquer nova execução por até 8h (expiração automática) mesmo sem nada rodando de verdade. Verificado via node temporário (`LOCK_EXISTS`, idade 1672s) e removido manualmente (`rm -f`) logo em seguida — a fila está livre para rodar novamente agora.

**Lição para o futuro:** evitar `update_workflow` (especialmente `addNode`/`removeNode`/mudanças em nodes de execução pesada como o Whisper.cpp) no workflow de produção enquanto uma execução real (não-temporária) pode estar em andamento — checar `search_executions` com `status:["running"]` antes de fazer edições estruturais, não só confiar que "parece" estar tudo parado.

**Efeito colateral positivo:** como a #61 já é uma execução real completa e bem-sucedida, ela também serviu de primeira validação em produção para duas features que ainda estavam pendentes de teste real: o fix do bug de metadados (08/07→16/07, ver seção acima) — os 8 arquivos `_meta.json` gerados tinham nomes únicos por clipe (`short_01_Pr.-Flávio Souza_jesus-revela-quem-voce-e_meta.json` até `short_08_...`), confirmando que o bug de sobrescrita está corrigido — e o nome do pregador no arquivo final (15/07/2026), com o prefixo `Pr.-Flávio Souza` corretamente extraído e aplicado em todos os 8 arquivos.

**Pendência atual:** o vídeo da Stephany Barros não foi processado (a execução que o pegou crashou) e continua na raiz `Videos-Cortes` — a fila não vai retomar sozinha (não há gatilho agendado, só o self-chaining que já foi interrompido). É necessário disparar o workflow manualmente de novo (ou usar o schedule skill para agendar) para ele ser pego — o lock já foi liberado, então a próxima execução deve rodar normalmente.

**Segunda validação real — execução #72 → #73 (16/07/2026):** o usuário disparou o workflow manualmente de novo (via UI do n8n) para pegar o vídeo da Stephany Barros. A execução #72 completou com sucesso (1h44min — bem mais rápido que os ~3-5h típicos, provavelmente já usando o `large-v3-turbo`) e disparou automaticamente a #73, que também completou com sucesso (~1h20min), processando o vídeo do Pr. Lucas Felisberto. Duas cadeias de self-chaining consecutivas funcionando — parecia confirmar de vez a feature.

**Terceira tentativa revela um bug estrutural — execução #76 → #77 (17/07/2026):** o usuário disparou o workflow de novo manualmente (vídeo do Pr. Daniel dos Santos, execução #76), que completou com sucesso (8 clipes, vídeo movido, `Decidir Próximo Vídeo` encontrou corretamente 6 vídeos restantes na fila, incluindo "Céu um retorno para o lar — Pr. Marcos Xavier"). Mas desta vez `Disparar Próximo Vídeo` (execução #77) falhou imediatamente com `Workflow is not active and cannot be executed` (stack trace em `getPublishedWorkflowData`).

**Causa raiz:** o node "Disparar Próximo Vídeo" usa `n8n-nodes-base.executeWorkflow` com `source:"database"` chamando o workflow **por ID** (a si mesmo). Nesta versão do n8n (2.30.6, self-hosted, com sistema de versionamento draft/publish), esse tipo de chamada busca especificamente a **versão publicada/ativa** do workflow-alvo — não a versão em rascunho mais recente. Só que este workflow **nunca foi formalmente publicado**: `active:false`, `activeVersionId:null` o tempo todo. Tentei `publish_workflow` diretamente e recebi o erro `"Workflow cannot be activated because it has no trigger node. At least one trigger, webhook, or polling node is required"` — o único trigger existente era o "Iniciar Manualmente" (Manual Trigger), e o n8n **não permite ativar/publicar um workflow cujo único trigger é manual** (faz sentido: "ativo" normalmente significa "roda sozinho em produção", e um trigger manual por definição não roda sozinho).

**Por que funcionou nas 2 primeiras vezes (#61→#62, #72→#73) e só quebrou na 3ª:** isso não ficou 100% confirmado, mas a explicação mais provável é que esses 2 primeiros sucessos aconteceram por causa de algum estado de cache/sessão interno do n8n relacionado a execuções manuais recentes (não uma "ativação" de verdade, já que `active` sempre esteve `false`) — e minhas próprias edições ao vivo no workflow via `update_workflow` (adicionar/remover nodes temporários de diagnóstico entre as tentativas #73 e #77) provavelmente invalidaram esse estado, expondo o problema estrutural que sempre existiu, só que mascarado até então. Isso é consistente com o padrão já visto no crash da execução #62 (edições concorrentes desestabilizando o motor de execução).

**Fix aplicado (17/07/2026), a pedido explícito do usuário:** adicionado um node **"A Cada 6 Horas"** (`n8n-nodes-base.scheduleTrigger`, intervalo de 6 horas) conectado ao mesmo ponto de entrada que o Manual Trigger ("Resolver Pasta") — e então `publish_workflow` foi chamado com sucesso (`activeVersionId` gerado), já que agora existe um trigger de polling válido. Isso resolve o problema de duas formas:
1. **Ativa o workflow de verdade** — `Disparar Próximo Vídeo` agora encontra uma versão publicada válida, então o self-chaining deve parar de falhar com esse erro específico.
2. **Cria uma rede de segurança independente do self-chaining:** mesmo que a cadeia quebre de novo por qualquer outro motivo (crash, edição concorrente, etc.), o Schedule Trigger reexecuta o workflow a cada 6h de qualquer forma — se houver vídeo elegível na fila e o lock estiver livre, ele processa; se não houver nada, os nodes de seleção de vídeo simplesmente não encontram trabalho e o fluxo não avança (sem gerar erro barulhento, já que "Selecionar Vídeo" só lança erro se existir vídeo mas ele parecer corrompido/sincronizando — pasta vazia não é esse caso, é só ausência de itens elegíveis... **checar esse comportamento na próxima execução agendada real**, já que o código atual de "Selecionar Vídeo" lança erro se `allVideos.length === 0`, o que pode gerar um erro "esperado" a cada 6h quando a fila estiver vazia — não é perigoso, mas pode poluir o histórico de execuções com erros previsíveis; vale revisar se isso incomodar).

**Ação imediata:** disparei a execução #78 manualmente para retomar a fila (6 vídeos parados, começando pelo do Pr. Marcos Xavier) enquanto o fix estrutural era aplicado — ela ficou rodando em paralelo à investigação e não foi afetada pela publicação do workflow (publicar não interrompe execuções em andamento).

**Ainda não validado:** falta confirmar com uma execução real que o self-chaining volta a funcionar de ponta a ponta agora que o workflow está publicado, e observar se o Schedule Trigger de fato dispara sozinho quando chegar sua hora (não apenas quando chamado via self-chain ou manual).

**Schedule Trigger validado — dispara sozinho a cada 6h (confirmado 20/07/2026):** `search_executions` mostrou execuções `mode:"trigger"` disparadas automaticamente e espaçadas exatamente 6h uma da outra (16:00, 22:00, 04:00, 10:00) nos dias seguintes — confirma que a publicação resolveu tanto a ativação quanto a rede de segurança agendada, exatamente como projetado.

---

## Bug corrigido — "Selecionar Vídeo" marcava execução como erro quando a fila estava vazia (20/07/2026)

**Pedido do usuário:** "quando não encontrar o video retornar a mensagem que não encontrou e deixar o status como sucesso ou algum status diferente de erro, pois não é erro." Confirma exatamente a preocupação já registrada na seção anterior ("pode poluir o histórico de execuções com erros previsíveis") — e de fato, ao checar as execuções `mode:"trigger"` reais (#89, #93, #95, #96, todas disparadas pelo "A Cada 6 Horas"), várias vieram com `status:"error"` só porque a pasta `Videos-Cortes` estava vazia no momento daquela checagem — um estado normal e esperado (fila sem vídeo novo), não uma falha do pipeline.

**Causa:** o node "Selecionar Vídeo" usava `throw new Error(...)` tanto para "nenhum vídeo na pasta" quanto para "vídeo(s) encontrado(s) mas ainda sincronizando (tamanho < 1MB)" — qualquer `throw` num Code node marca a execução inteira como `error` no histórico do n8n, mesmo quando a causa é só "não há nada para fazer agora".

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):**
1. **"Selecionar Vídeo" reescrito** para nunca mais lançar `throw` nesses dois casos — em vez disso, retorna um item normal `{ videoFound: false, message: '...' }` com a mesma mensagem explicativa de antes (fila vazia, ou vídeo(s) ainda sincronizando). Quando encontra um vídeo elegível, retorna `{ videoFound: true, ...ready[0] }` — mantém todos os campos originais do vídeo (name, id, `@microsoft.graph.downloadUrl` etc.) intactos via spread, então nada downstream que já lia esses campos precisou mudar.
2. **Novo node "Vídeo Encontrado?"** (`n8n-nodes-base.if`, v2.3), inserido entre "Selecionar Vídeo" e "Verificar Trava de Execução": checa `{{ $json.videoFound }}`. Se `true`, segue o pipeline normalmente (saída 0, mesma conexão que existia antes). Se `false`, a saída 1 fica propositalmente **sem conexão** — o item simplesmente para ali, a execução termina com `status:"success"`, e a mensagem explicativa fica visível no próprio output do node "Selecionar Vídeo" (e do "Vídeo Encontrado?", que apenas repassa o mesmo JSON) para quem for inspecionar a execução depois.

**Por que um IF node em vez de só `return []` (mesmo padrão já usado em "Decidir Próximo Vídeo"):** `return []` também evita erro e para a cadeia, mas descarta qualquer mensagem — o pedido do usuário foi explícito em "retornar a mensagem que não encontrou", não só "não dar erro". Retornar um item real com `message` e gatear com IF preserva essa mensagem visível na execução, o que `return []` sozinho não permite (zero itens não carregam JSON nenhum).

**Necessidade de republicar após cada edição estrutural:** confirmado de novo nesta sessão que qualquer `addNode`/`removeConnection`/`addConnection` via `update_workflow` deixa o workflow como rascunho não-publicado — mesmo já tendo sido publicado antes. `publish_workflow` precisou ser chamado de novo depois deste fix para o self-chaining e o Schedule Trigger continuarem funcionando (não é automático). **Lição reforçada:** toda edição estrutural neste workflow deve terminar com um `publish_workflow`, não só a primeira vez.

**Validado:** inspecionei o node "Selecionar Vídeo" já publicado (`get_workflow_details` após o fix) e confirmei que o código novo e a conexão via "Vídeo Encontrado?" estão ativos (`active:true`, `activeVersionId` atualizado). As execuções `error` anteriores (#89, #93, #95, #96) são todas de ANTES deste fix — a próxima checagem agendada (a cada 6h) já deve vir como `success` quando não houver vídeo novo.

**Achado à parte (não corrigido, só registrado):** a execução #93 (19/07, disparada pelo Schedule Trigger) falhou de verdade — não por fila vazia — no node "Mover Vídeo Processado", com erro da Microsoft Graph API `"The resource you are requesting could not be found"`, depois de ~4h26min processando um vídeo até o fim. Parece um erro transitório do Graph API (item não encontrado no momento do PATCH de mover), não relacionado a este fix. Vale investigar se se repetir.

---

## Nome do pregador na descrição dos shorts (15/07/2026)

**Pedido do usuário:** "quando tiver o nome da pessoa incluir nome + descrição que já tem hoje" nos shorts. Perguntado onde exatamente incluir (campo novo no JSON, junto na descrição/hook, ou no título do short), o usuário escolheu **juntar no campo de descrição já existente** — sem criar campo novo, sem mexer no título/nome do arquivo.

**Implementação (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):** no node "Montar Clipes", logo após `const vp = c.videoPath, vn = c.videoName;`, um regex extrai o nome do pregador do nome do arquivo de vídeo:

```javascript
const preacherMatch = (vn || '').match(/Pr\.?a?\.?\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,4})/);
const preacherName = preacherMatch ? preacherMatch[0].trim().replace(/\s+/g,' ') : null;
```

Depois, ao montar o `metaContent` de cada clipe, o campo `reason` (a "descrição" que já existia, com o texto "por que o clipe funciona") passa a vir prefixado com o nome quando encontrado:

```javascript
const clipReason = preacherName ? (preacherName + ' — ' + (clip.reason||'')) : (clip.reason||'');
```

Resultado no `_meta.json`: `"reason": "Pr. Rodnei Romano — <descrição original do clipe>"`. Se o regex não encontrar nada (vídeos sem o padrão "Pr. Nome" no arquivo, como conteúdo não relacionado a pregação), `reason` fica exatamente como era antes — sem prefixo forçado.

**Por que o `hook` não foi alterado:** o campo `hook` é a frase exata de abertura falada no vídeo (citação literal usada pela IA para julgar o gancho do clipe) — prefixar o nome ali quebraria a fidelidade da transcrição. O campo `reason` ("por que funciona") é a explicação em linguagem natural, por isso foi o escolhido como "a descrição" para receber o nome.

**Por que regex no nome do arquivo, e não um campo de configuração manual:** todos os vídeos deste projeto seguem o padrão de nomenclatura `"<Título> || Culto Ao Vivo - DD/MM/AAAA | Pr. Nome Sobrenome [ID-do-YouTube].mp4"` (ou variações com `_1080p` no lugar do ID) — o nome do pregador já está sempre presente no nome do arquivo antes mesmo do vídeo chegar ao pipeline. Extrair automaticamente evita um passo manual por vídeo e funciona tanto para "Pr." quanto para uma eventual pregadora ("Pra.", coberto pelo `a?` opcional no regex).

**Testado com harness Node (fora do browser) contra os 7 nomes de arquivo reais observados na pasta `Videos-Cortes/Videos` nesta sessão:**

| Nome do arquivo | Nome extraído |
|---|---|
| `Culto Ao Vivo - 07/07/2026 \| Pr. Rodnei Romano_1080p.mp4` | `Pr. Rodnei Romano` |
| `Culto Ao Vivo - 12/07/2026 \| Pr. Daniel dos Santos_1080p.mp4` | `Pr. Daniel dos Santos` |
| `Fique Atento à Oportunidade \|\| Culto Ao Vivo - 30/06/2026 \| Pr. Claudio Silva [1BW3q7YV1P0].mp4` | `Pr. Claudio Silva` |
| `Quem é você depois do culto? - 14/06/2026 \| Pr. Claudio Silva [4PdRgC-xvsE].mp4` | `Pr. Claudio Silva` |
| `Reforma de Deus \|\| Culto Ao Vivo - 05/07/2026 \| Pr. Daniel dos Santos [ohEv2mTvhG4].mp4` | `Pr. Daniel dos Santos` |
| `TUDO SOBRE CARROS E PREPARAÇÃO AUTOMOTIVA... [AulJ8pGSsnU].mp4` (sem "Pr.") | `null` (sem prefixo) |
| `SGT NANTES + JORGE LORDELLO - Flow #584 [HUdTabCyFgE].mp4` (sem "Pr.") | `null` (sem prefixo) |

Todos os 7 casos reais bateram com o esperado, incluindo os 2 vídeos sem relação com pregação corretamente não recebendo nenhum prefixo.

**Validado em produção (16/07/2026):** a execução #61 (vídeo "Não Deu Errado, Foi Livramento" — Pr. Flávio Souza) gerou os 8 `_meta.json` com o campo `reason` corretamente prefixado com `"Pr. Flávio Souza — "`. Ver seção "Fila automática" acima para o detalhe completo desta execução.

**Extensão em 15/07/2026 — nome do pregador também no nome do arquivo final:** a pedido do usuário ("preciso que os arquivos finais dos cortes tenham o nome do pregador... exemplo: `short_08_jesus-esta-cuidando.mp4` deve ficar `short_08_Pr.-César Martins_jesus-esta-cuidando.mp4`, isso se tiver o nome no vídeo original, senão tiver pode mandar da mesma forma"), o `slug` usado para nomear o arquivo `.mp4` final (e o `_meta.json` correspondente, já que ambos reusam a mesma variável `slug`/`titleSlug`) passou a incluir o nome do pregador quando disponível:

```javascript
const titleSlug = (clip.title||'clip').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);
const preacherSlug = preacherName ? preacherName.replace(' ', '-') : null;
const slug = preacherSlug ? (preacherSlug + '_' + titleSlug) : titleSlug;
```

`preacherName.replace(' ', '-')` (sem flag `g`) troca só o **primeiro** espaço — o que fica logo depois de "Pr." — mantendo o restante do nome com espaços normais (ex: `"Pr. César Martins"` → `"Pr.-César Martins"`, preservando "César Martins" como está). Isso reproduz exatamente o formato pedido no exemplo do usuário. Resultado final: `outPath` (usado tanto no corte FFmpeg quanto no nome do arquivo enviado ao OneDrive via "Upload Short → OneDrive") e o nome do `_meta.json` (via "Upload Metadados → OneDrive", que reusa o mesmo `titleSlug`) ficam consistentes: `short_08_Pr.-César Martins_jesus-esta-cuidando.mp4` e `short_08_Pr.-César Martins_jesus-esta-cuidando_meta.json`.

**Por que reaproveitar a variável `slug` em vez de criar um campo separado:** tanto o `outPath` local (usado no comando FFmpeg e depois no upload) quanto o `fileName` dos dois nodes de upload (`Upload Short → OneDrive` e `Upload Metadados → OneDrive`) já dependem só de `idx` + `titleSlug` (o campo carregado no item do loop) — mudar a fonte de `titleSlug` nesse único ponto do "Montar Clipes" propaga automaticamente para os três lugares onde o nome do arquivo é usado, sem precisar tocar nos nodes de upload nem no comando FFmpeg.

**Segurança do shell:** o `outPath` (agora contendo espaços e um ponto no meio do nome, ex: `.../short_08_Pr.-César Martins_jesus-esta-cuidando.mp4`) é usado dentro de comandos `Execute Command` (FFmpeg, `rm -f`) — todos os usos já envolvem o valor entre aspas duplas (`"{{ $json.outPath }}"`), então espaços e caracteres acentuados não quebram o shell. Nomes de pregador não devem conter aspas, `$`, crase ou barras — os únicos caracteres esperados são letras (com acento), espaços, ponto e hífen, todos seguros dentro de aspas duplas no `/bin/sh` do Alpine.

**Validado em produção (16/07/2026):** a execução #61 gerou os 8 arquivos finais no padrão esperado, ex: `short_01_Pr.-Flávio Souza_jesus-revela-quem-voce-e.mp4` e o `_meta.json` correspondente com o mesmo slug — confirmando que o `.replace(' ', '-')` de espaço único funcionou como projetado em produção, não só no teste isolado do regex. Ver seção "Fila automática" acima.

---

## Bug corrigido — metadados nunca eram gerados de verdade, sempre sobrescreviam os mesmos ~8 arquivos genéricos (16/07/2026)

**Sintoma reportado pelo usuário:** "o meta dados não está sendo gerado no final". Verificação inicial: a pasta `Videos-Cortes/Cortes` no OneDrive tinha 50 arquivos, **todos `.mp4`, zero `.json`** — nenhum arquivo de metadados visível, apesar do node "Upload Metadados → OneDrive" reportar `executionStatus:"success"` e `error:null` em todas as 7 chamadas da execução mais recente (#58).

**Diagnóstico:** inspecionando a resposta completa (não só o status) do node "Upload Metadados → OneDrive" na execução #58 via `get_execution`, o item realmente criado/atualizado no OneDrive tinha `"name": "clip_01_meta.json"` — **não** `"short_01_humildade-em-fogo_meta.json"` como o parâmetro `fileName` do node deveria produzir. Além disso, `createdDateTime` desse item era **09/07/2026**, e `lastModifiedDateTime` era a hora exata da execução #58 (16/07) — ou seja, o item já existia há uma semana e só teve o *conteúdo* atualizado, não foi criado do zero. Testando os 7 uploads da execução, todos os 7 arquivos (`clip_01_meta.json` até `clip_07_meta.json`) tinham `createdDateTime` de 08–09/07/2026, confirmando que **desde pelo menos 08/07/2026, todo vídeo processado sobrescreve os mesmos ~7-8 arquivos de metadados genéricos**, em vez de criar um arquivo novo e distinto por clipe.

**Causa raiz:** o node "Upload Metadados → OneDrive" (`n8n-nodes-base.microsoftOneDrive`, `typeVersion:1`, `resource/operation` implícitos) tem um parâmetro `fileName` configurado corretamente com uma expressão (`={{ 'short_' + ... + '_meta.json' }}`), mas **esse parâmetro não é respeitado pela implementação do node** — na prática, o upload usa o nome do arquivo **local** (o `binary.data.fileName`, populado automaticamente pelo node anterior "Ler Metadados do Disco" a partir do caminho lido em disco) em vez do parâmetro explícito. Como o `metaPath` local sempre foi um nome genérico e fixo por índice (`/home/node/.n8n-files/clip_01_meta.json`, `clip_02_meta.json`, etc. — **igual em TODO vídeo processado**, já que só depende do índice do clipe, não do conteúdo), cada novo vídeo processado sobrescreve o metadado do vídeo anterior que teve o mesmo índice de clipe.

**Por que isso não aconteceu com o `.mp4` (Upload Short → OneDrive):** esse node tem exatamente o mesmo problema estrutural (o parâmetro `fileName` também não é respeitado), mas nunca foi percebido porque, por coincidência, o nome do arquivo **local** do vídeo já é `short_01_humildade-em-fogo.mp4` — ou seja, `outPath` já é construído com o nome final desejado (`base+'short_'+idx+'_'+slug+'.mp4'`), então usar o nome local OU o parâmetro `fileName` dá exatamente o mesmo resultado. Isso mascarou o bug por completo — o problema só ficou visível no `_meta.json`, cujo nome local (`clip_XX_meta.json`) sempre foi diferente do nome final desejado.

**Fix aplicado (nos três lugares — n8n via MCP, HTML, `workflow-blocos.json`):** no node "Montar Clipes", a variável `metaPath` (o caminho do arquivo de metadados **local**, na VPS) passou a usar o mesmo padrão de nome final do `outPath`, em vez de um nome genérico:

```javascript
// Antes:
const metaPath  = base+'clip_'+idx+'_meta.json';

// Depois:
const metaPath  = base+'short_'+idx+'_'+slug+'_meta.json';
```

Isso corrige o problema **independente da causa exata** de o node ignorar o parâmetro `fileName` — como o nome local passa a ser idêntico ao nome final desejado, o upload fica correto não importa qual dos dois (parâmetro explícito ou nome do binário) a implementação do node realmente usa internamente. É o mesmo padrão que já funcionava, sem querer, para o `.mp4`.

**Efeito colateral também corrigido:** antes, como só existiam ~8 nomes possíveis de metadado (`clip_01` a `clip_08`), rodar N vídeos diferentes resultava em **no máximo 8 arquivos de metadado sobrevivendo no OneDrive**, sempre pertencentes ao vídeo mais recente processado para aquele índice — todo o histórico de metadados de vídeos anteriores era silenciosamente perdido a cada execução. Com o fix, cada clipe de cada vídeo agora gera um arquivo de metadado com nome único (`short_01_pr-cesar-martins_humildade-em-fogo_meta.json`, por exemplo), preservando o histórico completo.

**Arquivos órfãos remanescentes:** os ~7-8 arquivos genéricos `clip_01_meta.json` a `clip_08_meta.json` (criados entre 08–09/07, sobrescritos repetidamente até 16/07) continuam na pasta `Videos-Cortes/Cortes` com o conteúdo do último vídeo que os sobrescreveu — não foram apagados automaticamente. Podem ser removidos manualmente pelo usuário no OneDrive, ou apagados via uma limpeza pontual se solicitado.

**Validado com execução real (16/07/2026):** a execução #61 gerou os 8 `_meta.json` com nomes únicos e distintos (`short_01_Pr.-Flávio Souza_..._meta.json` até `short_08_...`) — primeira vez desde 08/07/2026 que o pipeline produz metadados de verdade em vez de sobrescrever os ~8 arquivos genéricos. Ver seção "Fila automática" abaixo para o relato completo desta execução.

---

## Troca de modelo whisper.cpp — large-v3 → large-v3-turbo (16/07/2026)

**Pedido do usuário:** "tem alguma coisa mais rapido com a mesma qualidade ou melhor que o whisper" — seguido de "pode trocar para large-v3-turbo" depois de eu explicar as opções.

**Pesquisa feita antes de decidir:** duas alternativas reais de transcrição mais rápida existem hoje: (1) `faster-whisper` (biblioteca Python baseada em CTranslate2, roda no mesmo hardware — GPU ou CPU — mas com kernels mais otimizados), e (2) `whisper.cpp` com o modelo `large-v3-turbo` (variante destilada da OpenAI, lançada em outubro/2024). Descartei `faster-whisper` de cara porque exige Python (`pip install faster-whisper` + `ctranslate2`), e a VPS deste projeto roda uma imagem Alpine hardened **sem `python3`** (ver seção "Lição para o futuro" mais acima, descoberta em 13/07/2026 durante o fix do download via wget) — trocar de mecanismo de transcrição exigiria instalar um runtime Python inteiro numa imagem propositalmente minimalista, contra a natureza "hardened" do ambiente. `large-v3-turbo`, por outro lado, é só um arquivo de modelo `.bin` diferente para o mesmo binário `whisper.cpp` já instalado e funcionando — zero mudança de dependências.

**O que muda tecnicamente no `large-v3-turbo`:** é uma destilação do `large-v3` — o encoder (a parte que "ouve" o áudio e entende fonética/contexto) permanece com as 32 camadas originais, intactas; só o decoder (a parte que gera o texto final a partir do que o encoder entendeu) foi reduzido de 32 para 4 camadas. Resultado: ganho de velocidade de ~6-8x em relação ao `large-v3` cheio, com perda de qualidade concentrada principalmente em cenários difíceis (múltiplos falantes sobrepostos, sotaques muito fortes, áudio com ruído de fundo pesado) — não é o perfil do áudio deste projeto (um só pregador falando, microfone de igreja, áudio limpo), então o risco de perda de qualidade perceptível é considerado baixo.

**Impacto esperado no tempo de execução:** a transcrição via whisper.cpp é hoje o maior gargalo de tempo do pipeline (a análise da execução #51, por exemplo, mostrou horas de processamento majoritariamente concentradas no whisper.cpp `large-v3` com `-t 6`). Com `large-v3-turbo`, essa etapa deve cair de forma significativa — não medido ainda com um run real, mas a literatura pública sobre o modelo aponta a mesma faixa de 6-8x mencionada acima para hardware CPU-only comparável ao desta VPS (6 núcleos, sem GPU).

**Descoberta feita ao tentar baixar o modelo — `/models/` não é gravável pelo usuário do n8n:** a primeira tentativa foi baixar `ggml-large-v3-turbo.bin` direto para `/models/` (mesma pasta onde `ggml-large-v3.bin` já vive), replicando o padrão de setup documentado para o modelo anterior. Um node temporário de diagnóstico (mesma técnica de "node temporário" já descrita na seção "Conexão MCP com n8n") rodando `whoami && id && ls -la /models/` revelou:
- O processo do n8n roda como usuário `node` (uid 1000, gid 1000).
- `/models/` pertence a `root:root` (`drwxr-xr-x`) — sem permissão de escrita para `node`. Um `touch /models/.writetest` confirmou: `Permission denied`.
- `ggml-large-v3.bin` (o modelo atual, 3.09GB) já existe em `/models/` — provavelmente foi colocado lá manualmente por alguém com acesso root/sudo na VPS (SSH direto), não pelo próprio workflow n8n. Isso explica por que ninguém tinha notado essa limitação antes: o pipeline nunca precisou *escrever* em `/models/`, só *ler* de lá.
- Em contraste, `/home/node/.n8n-files/` (a pasta onde todo o resto do pipeline já grava arquivos temporários — vídeo baixado, áudio extraído, SRTs, clipes cortados) tem escrita liberada para `node` (confirmado com um segundo `touch` de teste).

**Decisão — baixar o modelo para `/home/node/.n8n-files/` em vez de pedir acesso root ao usuário:** em vez de interromper o trabalho para pedir que o usuário desse permissão de escrita em `/models/` (ou copiasse o arquivo manualmente via SSH), usei o mesmo node temporário para rodar `wget` direto para `/home/node/.n8n-files/ggml-large-v3-turbo.bin` — que já é gravável e já é o diretório convencionado do projeto para arquivos gerados/baixados em tempo de execução. Download concluído com sucesso: **1.624.555.275 bytes (~1.51GiB)**, em ~53 segundos (bem mais rápido que os vídeos de vários GB baixados do OneDrive, já que vem de um CDN da Hugging Face). O comando do node "Whisper.cpp Transcrever" foi então apontado para esse novo caminho:

```bash
# Antes:
whisper -m /models/ggml-large-v3.bin -t 6 -f "{{ $json.audioPath }}" -l pt -osrt -of "{{ $json.srtBase }}" -np && cat "{{ $json.srtPath }}"

# Depois:
whisper -m /home/node/.n8n-files/ggml-large-v3-turbo.bin -t 6 -f "{{ $json.audioPath }}" -l pt -osrt -of "{{ $json.srtBase }}" -np && cat "{{ $json.srtPath }}"
```

**Por que isso é seguro mesmo sem ser o diretório "oficial" `/models/`:** o binário `whisper` só precisa do caminho apontado por `-m`, não importa em qual pasta o arquivo `.bin` está — não há nenhuma configuração implícita ou hardcoded em outro lugar que assuma `/models/` como único local válido. `/home/node/.n8n-files/` já é montado como volume persistente do container n8n (é onde `ggml-large-v3.bin` antigo NÃO está, mas onde todos os outros arquivos do pipeline sempre viveram) — o arquivo do modelo sobrevive a reinícios do container do mesmo jeito que os outros arquivos do pipeline já sobrevivem hoje. **Ponto de atenção real:** diferente de `/models/` (que parece ser um volume dedicado só para modelos, gerenciado manualmente por quem tem acesso root), `/home/node/.n8n-files/` também recebe o vídeo original baixado (vários GB) e é limpo (`rm -f`) ao fim de cada execução — o arquivo do modelo (1.51GiB, nome fixo `ggml-large-v3-turbo.bin`) nunca é alvo desse `rm -f` (os comandos de limpeza sempre referenciam caminhos específicos de vídeo/áudio/SRT/clipe daquela execução, nunca um wildcard), então não há risco de o modelo ser apagado acidentalmente por engano — mas vale ter isso em mente se um dia alguém for "limpar a pasta manualmente" pensando que só tem lixo temporário lá.

**`ggml-large-v3.bin` (modelo antigo) não foi removido de `/models/`** — não há necessidade nem urgência de apagá-lo (3.09GB não é um custo de armazenamento relevante e nada mais no workflow o referencia depois desta mudança), e removê-lo exigiria acesso root que este processo não tem de qualquer forma.

**Aplicado nos três lugares:**
1. **n8n via MCP** (`ID4wisnN4Tqpt2zh`, node "Whisper.cpp Transcrever") — `updateNodeParameters`, comando trocado para o novo modelo/caminho.
2. **`n8n-video-silence-cutter.html`** — 4 ocorrências de `ggml-large-v3.bin` atualizadas para `ggml-large-v3-turbo.bin` com o caminho `/home/node/.n8n-files/`: a descrição textual do node (linha ~184), o exemplo de código exibido na UI (linha ~186), o `command` real do node "Whisper.cpp Transcrever" na função `buildBlockWorkflow()` (linha ~825), e o `command` do node dormente "Whisper.cpp Transcrever Clipe" (linha ~868, usado só se `cfg.includeSubtitles` for reativado no futuro — legendas estão desabilitadas desde 08/07/2026, mas mantive o template consistente com o resto do código).
3. **`workflow-blocos.json`** — mesma troca no `command` do node "Whisper.cpp Transcrever" (única ocorrência no JSON estático, já que o node de legenda por clipe foi fisicamente removido deste arquivo quando as legendas foram desabilitadas).

**Node temporário de diagnóstico revertido:** o node "TEMP Checar Permissoes" (criado para descobrir o problema de permissão) foi removido do workflow após o uso, e a conexão do trigger ("Iniciar Manualmente") foi restaurada para apontar de volta ao node normal ("Resolver Pasta") — o workflow está de volta ao estado normal, executável (34 nodes, confirmado via `get_workflow_details`).

**Ainda não testado com uma execução real do pipeline completo usando o novo modelo** — a próxima execução deve confirmar (a) que o whisper.cpp encontra e carrega `ggml-large-v3-turbo.bin` sem erro de "model not found", (b) o tempo real de transcrição comparado às execuções anteriores com `large-v3` (referência: execução #51 e #58, ambas usando `large-v3` cheio), e (c) se a qualidade da transcrição em português permanece boa o suficiente para os prompts de IA (PASSO 0/1/2) continuarem funcionando sem regressão perceptível.

---

## Análise da qualidade dos clipes (último run)

Vídeo: "Quem é você depois do culto? — 14/06/2026"
6 clipes, 58% do vídeo coberto (438s de 752s)

| Clip | Trecho | Dur | Gap ant. | Score | Observação |
|------|--------|-----|----------|-------|------------|
| 1 | 1:03→2:06 | 63s | — | 92 | OK. Intro (0–63s) ignorada |
| 2 | 3:34→4:38 | 64s | 88s | 94 | OK. Gap 2:06–3:34 não coberto (maior lacuna) |
| 3 | 5:00→6:08 | 68s | 22s | 91 | OK. Próximo do clip 2 tematicamente |
| 4 | 7:10→8:20 | 70s | 62s | 89 | Hook fraco — "Olha o Glória Deus" é reação, não abertura |
| 5 | 9:20→10:26 | 66s | 60s | 93 | Melhor aplicação prática |
| 6 | 10:46→12:32 | 106s | 20s | 95 | Longo (>90s); maior score |

**Problema transversal:** assistindo os vídeos, todos têm cortes no meio do raciocínio (bug pendente prioritário).

---

## Fluxo de trabalho padrão

1. Editar `n8n-video-silence-cutter.html`
2. Abrir no browser → aba "Download" → gerar JSON (Blocos)
3. Importar o JSON no n8n (substituir workflow anterior)
4. Testar com vídeo real no n8n
5. `minBlockScore` já vem em 40 por padrão (desde 09/07/2026). Se um culto específico ainda travar no "Ranking dos Blocos" (nenhum bloco qualificado), considere baixar ainda mais (30–35) só para aquele vídeo, ou aceitar que ele tem pouco conteúdo cortável.

**06/07/2026:** `workflow-blocos.json` já foi regenerado com o fix do PASSO 0 (node "Mesclar Pausas Curtas") e está pronto para reimportar — não é necessário abrir o HTML no browser desta vez, a menos que quaira ajustar algum parâmetro de configuração antes.

**07/07/2026:** com o n8n conectado via MCP, o fluxo mudou — fixes pontuais em prompts/Code nodes podem ser aplicados **direto no workflow em produção** (`ID4wisnN4Tqpt2zh`) via `update_workflow`, sem passar pelo HTML. `n8n-video-silence-cutter.html` e `workflow-blocos.json` continuam sendo atualizados em paralelo (retroportados manualmente) para manter os três em sincronia e preservar a opção de reimportar do zero se necessário. O fix do checklist de janelas de tempo (ver seção "Bug pendente") foi aplicado nos três lugares nesta sessão.

**09/07/2026:** três novos fixes aplicados nos três lugares (n8n via MCP + HTML + `workflow-blocos.json`) na mesma sessão: (1) validação de tamanho mínimo no "Selecionar Vídeo" para evitar o bug do arquivo 0 bytes/"moov atom not found", (2) `retryOnFail` nos nodes de rede mais pesados (Baixar Vídeo, Upload Short/Metadados → OneDrive) para absorver timeouts transitórios do OneDrive, (3) `minBlockScore` padrão baixado de 70 para 40. Todos ainda aguardando validação com uma execução completa e bem-sucedida de ponta a ponta.

**14/07/2026:** o workflow agora processa vídeos em fila automática — não é mais "1 vídeo por disparo manual". Ao terminar um vídeo com sucesso, ele move o original para `Videos-Cortes/Videos` e dispara sozinho a próxima execução se sobrar algum vídeo elegível na raiz `Videos-Cortes`. Ver seção "Fila automática — loop sequencial + arquivamento de vídeos processados". Para colocar um vídeo na fila, basta soltá-lo diretamente na raiz de `Videos-Cortes` (não em subpastas) — o usuário optou por manter esse controle manual em vez de o pipeline também vasculhar `Videos-Cortes/Videos` em busca de vídeos novos.

**15/07/2026:** a pedido do usuário ("quando tiver o nome da pessoa incluir nome + descrição que já tem hoje nos shorts"), o node "Montar Clipes" agora extrai o nome do pregador do nome do arquivo de vídeo e prefixa no campo `reason` do `_meta.json` de cada clipe. Ver seção "Nome do pregador na descrição dos shorts" abaixo.

**16/07/2026:** o modelo de transcrição foi trocado de `ggml-large-v3.bin` para `ggml-large-v3-turbo.bin`, agora carregado de `/home/node/.n8n-files/ggml-large-v3-turbo.bin` (não de `/models/`, que não é gravável pelo usuário `node` — ver seção "Troca de modelo whisper.cpp"). Se o modelo precisar ser re-baixado no futuro (ex: nova VPS, volume recriado), a URL é `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin` (~1.51GiB) e o destino deve ser `/home/node/.n8n-files/`, não `/models/`.

**29/07/2026:** 4 fixes aplicados nos três lugares na mesma sessão (n8n via MCP + `update_workflow` + `publish_workflow`, `n8n-video-silence-cutter.html`, `workflow-blocos.json`), depois de uma auditoria de validação sobre os 165 clipes já gerados: (1) regex do pregador ampliada (Miss./Ap./Pb./Bispo, além de Pr./Pra.), (2) "Aplicar Trava" não derruba mais a execução em colisão de lock esperada — novo node "Trava Liberada?", (3) campo `criteria` propagado para o `_meta.json`, (4) aviso explícito + ocultação da nota enganosa no prompt de seleção final quando o "Ranking dos Blocos" cai no fallback. De quebra, corrigido um drift pré-existente: o HTML estava sem uma frase ("LEMBRETE CRÍTICO...") que já existia em produção/`workflow-blocos.json` no prompt do `Preparar GPT — Seleção Final`. **Não é necessário reimportar nada no n8n desta vez** — os fixes já foram aplicados direto em produção via MCP e o workflow já foi republicado (`activeVersionId` novo). Os arquivos locais (HTML/JSON) foram atualizados só para manter os três em sincronia, não para reimportar. **Ainda não testado com uma execução real.**

**29/07/2026 (mesmo dia, sessão de auditoria de timing):** criado o subagente `.claude/agents/clipador.md` (audita `start`/`end` dos shorts já gerados contra o vídeo original via detecção de silêncio) e rodada uma auditoria completa dos 113 clipes com metadados — achado: 45% cortados comprovadamente em fala contínua. Investigação da causa raiz encontrou 2 bugs reais no `silencePrefix`: `$NF` no awk pegava o campo errado (`silence_duration` em vez do timestamp de `silence_end`, já que ambos vêm na mesma linha do ffmpeg separados por `\|`) e o threshold fixo de `-30dB` não batia com o piso de ruído real das gravações (-13 a -25dB). Fix aplicado nos três lugares: threshold calibrado por vídeo (`volumedetect`), `awk` corrigido, e um snap simétrico novo para o `start` (que nunca tinha nenhuma correção por silêncio antes). Validado localmente rodando o comando ffmpeg real contra um clipe já processado — confirmado que a extensão do fim, que nunca disparava antes, agora funciona (estendeu ~19s até uma pausa real). Ver seção "Correção de timing dos cortes — threshold dinâmico + snap simétrico de início/fim" para detalhes técnicos completos. **Não é necessário reimportar nada no n8n** — aplicado direto em produção via MCP + republicado. **Ainda não testado com uma execução real do pipeline (VPS) nem com uma nova rodada do agente clipador para confirmar queda na taxa de RUIM.**

**22/08/2026:** fluxo passou a incluir OpenSpec para mudanças maiores/agrupadas — a auditoria de 17/08/2026 foi formalizada como a change `harden-block-pipeline-reliability` (`openspec/changes/harden-block-pipeline-reliability/`), com proposal/specs/design/tasks gerados via `/opsx:explore` e implementada localmente via `/opsx:apply` (HTML + `workflow-blocos.json` atualizados e validados com harness Node). O usuário criou a credential nativa OpenAI (`openAiApi`) no n8n via UI — não existe ferramenta de criação de credential no MCP (por design de segurança), então esse passo precisa ser manual mesmo. Ver a entrada correspondente em "Estado atual" acima para o resumo dos 4 fixes (retry, onError, credential, clamp de colisão) e `openspec/changes/harden-block-pipeline-reliability/tasks.md` para o checklist granular do que falta (grupos 7–9: aplicar em produção, validar com execução real, arquivar a change).

---

## Branch e estado git

Branch principal de desenvolvimento: `feature/inicial`
Branch main: `main`
Commits sem push são criados apenas quando o usuário pede explicitamente.
