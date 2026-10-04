# TypeBadge

Badge preenchido que diz de que tipo é o clipe (Pregação, Louvor, Podcast) e, ao lado, o formato quando não é um Short (Palavra Completa, Música completa).

`.clip-status-pill.type-badge` mais `.type-pregacao`, `.type-louvor`, `.type-podcast` ou `.type-palavra-completa` (`accent-blue`). Música completa reusa `.type-louvor`. Texto sempre `ink`. Vai no topo do corpo do card, antes do nome, com 4px entre badges.

São as únicas cores pastel da interface; não use estes tons para outra coisa. Extraído dos estilos inline de `VideoLibrary.tsx`. O consumidor fornece o tipo e as flags de formato.
