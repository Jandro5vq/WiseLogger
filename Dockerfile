# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.node_gyp \
    npm ci

FROM base AS prod-deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.node_gyp \
    npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone output (includes its own minimal node_modules for server.js)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prod node_modules on top — covers native addons and startup script deps
# (standalone's node_modules is a subset, so this merge is safe)
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=builder /app/drizzle/migrations ./drizzle/migrations
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "scripts/start.js"]
