## Why

Hoje o Clip Studio só corta pregação (Shorts e Palavra Completa) e podcast. O louvor do culto é descartado de propósito por todos os pipelines existentes: o filtro de fase do "Blocos" exclui `louvor` categoricamente. A biblioteca já tem o tipo `Louvor` no filtro e o enum `SubmissionMode.LOUVOR` já existe no banco, reservados por `add-video-type-category-filters`. Mesmo assim, nenhuma submissão consegue escolher Louvor e nenhum pipeline preenche `Videos-Cortes/Louvor/Cortes`, então o filtro sempre mostra "nenhum vídeo".

## What Changes

- **Novo workflow n8n "YouTube Louvor — Extração de Músicas e Trechos"**, dedicado só ao louvor e independente de Shorts, Palavra Completa e Podcast. A partir do vídeo de um **culto completo**, ele:
  - localiza as partes de louvor e ignora a pregação, os avisos, o dízimo/oferta, a abertura e o encerramento. É o inverso do filtro de fase do "Blocos";
  - identifica cada música e gera **um clipe por música completa**, do início ao fim da música;
  - gera também **Shorts dos melhores trechos** (refrão, clímax), com 30 a 180s e as mesmas regras de gap e snap de silêncio dos Shorts;
  - faz o crop de toda a saída em **9:16 vertical**, com crop central;
  - usa a trava de execução compartilhada com os outros 3 pipelines, fila própria (`Videos-Cortes/Louvor`), saída própria (`Videos-Cortes/Louvor/Cortes`) e arquivo próprio (`Videos-Cortes/Louvor/Videos`), com self-chaining e Schedule Trigger.
- **Enviar Vídeo (Clip Studio):** o seletor "Tipo de conteúdo" ganha a opção **Louvor**, ao lado de Pregação e Podcast. Ela vale tanto para "Link do YouTube" quanto para "Enviar arquivo". Com Louvor selecionado, o toggle "Modo Palavra Completa" não aparece e o modo fica fixo em `LOUVOR`.
- **API do Clip Studio:** a rota de submissão por link e a rota de início de upload aceitam `mode=LOUVOR`. O enum Prisma já tem `LOUVOR`, então não há migration.
- **Workflow de ingestão n8n (`mfqp4D5HKs0MNhv1`):**
  - rota `LOUVOR` na ingestão por link e por upload;
  - o webhook de listagem de clipes passa a incluir `Louvor/Cortes`;
  - a checagem de arquivamento passa a olhar `Louvor/Videos`.
- **Biblioteca (Vídeos):** o filtro de tipo `Louvor`, que já existe, passa a mostrar clipes reais. Clipes de música completa ganham um badge próprio ("Música completa") que os diferencia dos Shorts de trecho, no mesmo padrão do badge de Palavra Completa.

## Capabilities

### New Capabilities
- `louvor-clipping`: pipeline de cortes de louvor. Localiza o louvor dentro de um culto completo, gera um clipe por música completa e Shorts dos melhores trechos em 9:16, e segue as regras de trava, fila e saída dos demais pipelines.

### Modified Capabilities
- `clip-studio/youtube-ingestion`:
  - o modo `Louvor` entra entre os modos de submissão;
  - o seletor de tipo de conteúdo ganha Louvor;
  - existe um roteamento para a pasta de fila do Louvor;
  - o status de conclusão é rastreado pelo arquivamento em `Videos-Cortes/Louvor/Videos`.
- `clip-studio/video-upload-ingestion`: o upload direto de arquivo aceita o modo `Louvor` e entrega o arquivo na fila do Louvor.
- `clip-studio/video-library`:
  - a classificação `Louvor` passa a ser alimentada de verdade por `Videos-Cortes/Louvor/Cortes`;
  - clipes de música completa ganham um badge próprio.

## Impact

- **Clip Studio:**
  - `src/app/(dashboard)/enviar/SubmitForm.tsx`, com a pill Louvor e o `resolveMode`;
  - `src/app/api/submissions/route.ts`, com o enum zod;
  - `src/app/api/submissions/upload/init/route.ts`, com a validação de modo;
  - `src/lib/n8n-client.ts`, com a flag de música completa e o comentário de "branch inalcançável";
  - `src/app/(dashboard)/videos/VideoLibrary.tsx`, com o badge.
  - Sem migration Prisma.
- **n8n:**
  - um workflow novo de Louvor;
  - no workflow de ingestão `mfqp4D5HKs0MNhv1`: um IF novo, os nodes de upload para a pasta Louvor, as normalizações de modo, a listagem de clipes e a checagem de arquivamento.
  - Os ramos `SHORTS`, `PALAVRA_COMPLETA` e `PODCAST` devem continuar byte a byte idênticos.
- **OneDrive:** as pastas novas `Videos-Cortes/Louvor`, `/Cortes` e `/Videos` são criadas sob demanda e de forma idempotente.
- **VPS:** um quarto pipeline passa a disputar a trava compartilhada (`.processing.lock`). A transcrição de trechos com música é justamente o cenário do bug de alucinação do whisper.cpp, então `-mc 0` é obrigatório.
- **Custo:** 2 chamadas de IA por vídeo de louvor, no mesmo padrão do "Blocos".
