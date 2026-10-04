# Skeleton

Placeholder com brilho deslizante enquanto a biblioteca carrega, que pode levar alguns segundos.

`.skeleton-block` (gradiente `skeleton-base`/`skeleton-highlight`, 1,4s ease-in-out em loop) aplicado a formas que copiam o layout real: o `.thumb-wrap` do VideoCard e duas barras de texto (14px a 80% e 12px a 50%, `radius-xs`). Mostre 6 cards na `.video-grid`, para a grade não pular quando os clipes chegam. Sem animação com `prefers-reduced-motion`.

O consumidor fornece só a quantidade de itens. Use em vez de um texto "Carregando...".
