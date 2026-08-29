# syntax=docker/dockerfile:1

# ── Builder: install all deps, generate Prisma client, compile ─────────────
FROM node:22-bookworm-slim AS builder
# Prisma's query engine needs OpenSSL at both generate-time and runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ── Runtime: only what's needed to run the compiled app ─────────────────────
FROM node:22-bookworm-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000

CMD ["node", "--enable-source-maps", "dist/main.js"]
