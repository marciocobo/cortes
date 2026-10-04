# TypeBadge

Badge tonal que diz de que tipo é o clipe (Pregação, Louvor, Podcast) e, ao lado, o formato quando não é um Short (Palavra Completa, Música completa).

`.clip-status-pill.type-badge` mais `.type-pregacao`, `.type-louvor`, `.type-podcast` ou `.type-palavra-completa` (`accent-soft`/`accent`). Música completa reusa `.type-louvor`. Fundo no `type-*-soft`, texto na cor cheia, sem o ponto dos badges de status. Vão no topo do corpo do card, antes do nome, dentro de `.badges` (gap 4px).

Essas cores não servem para mais nada. O consumidor fornece o tipo e as flags de formato.
