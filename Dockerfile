# Multi-stage build for the TakeMyLucky full-stack app.
# Dependencies are installed exactly once (in the build stage) to keep the
# builder's memory/time low — a second `npm ci` was OOM-killing constrained
# CI builders (exit 137). The runtime image reuses the pruned node_modules.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install all deps once (better-sqlite3 ships prebuilt binaries for this
# platform, so no native compilation is needed). Skip audit/fund for speed.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build                 # type-check + build the SPA into /app/dist
RUN npm prune --omit=dev          # drop dev deps; tsx is a prod dep and stays

# --- Runtime image ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Reuse the already-installed, dev-pruned modules — no reinstall on the builder.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json tsconfig.json ./
COPY server ./server

# SQLite database directory. Attach a persistent volume at /var/data on your
# host (Railway Volume, Render disk, or a docker volume — see docker-compose).
# NOTE: no Dockerfile VOLUME instruction — Railway rejects it; persistence is
# provided by the platform's volume mounted at this path instead.
ENV DB_PATH=/var/data/casino.db
RUN mkdir -p /var/data

EXPOSE 3001
# JWT_SECRET may be provided at runtime. If it is absent in production, the
# server generates one and persists it next to the database (server/config.ts).
CMD ["npx", "tsx", "server/index.ts"]
