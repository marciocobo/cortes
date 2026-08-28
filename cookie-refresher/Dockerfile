# Playwright's official image ships a matching Chromium build + all system
# deps pre-installed — avoids re-deriving that dependency list on the VPS,
# and keeps this heavy dependency entirely isolated from the Alpine-hardened
# n8n container (see design.md — Decisions).
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=4600
EXPOSE 4600

CMD ["node", "src/server.js"]
