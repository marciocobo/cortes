# Multi-stage build for Clip Studio (Next.js). Mirrors the other app stacks
# already running on this VPS (see VPS.md) - built and run as a plain
# Docker Compose service, no special base image requirements.

FROM node:22-alpine AS base

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall (`prisma generate`) needs prisma/schema.prisma,
# which isn't copied into this stage - it runs explicitly in the build stage below
# once the full source is present.
RUN npm ci --ignore-scripts

# ---- build ----
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL isn't needed at build time (no static DB access during build),
# but Prisma's generate step (postinstall) needs the schema present, which
# COPY . . already provides.
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/generated ./src/generated

USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]
