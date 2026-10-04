# Skeleton

Placeholder com brilho deslizante enquanto a biblioteca carrega, o que pode levar alguns segundos.

`.skeleton-block` (gradiente `skeleton-base`/`skeleton-highlight`, 1,4s ease-in-out em loop) aplicado a formas que copiam o layout real: o `.thumb-wrap` do VideoCard e duas barras de texto, `.skeleton-line` (14px a 80%) e `.skeleton-line-sm` (12px a 50%), ambas `radius-xs`. Mostre 6 cards na `.video-grid`, para a grade não pular quando os clipes chegam. Sem animação com `prefers-reduced-motion`.

O consumidor fornece só a quantidade de itens. Use em vez de um texto "Carregando..." na grade.
