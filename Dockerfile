# Multi-stage build for the Trading Journal full-stack app.
# Dependencies are installed exactly once (in the build stage) to keep the
# builder's memory/time low — a second `npm ci` was OOM-killing constrained
# CI builders (exit 137). The runtime image reuses the pruned node_modules.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Build toolchain for native modules (better-sqlite3): if a prebuilt binary
# isn't available for this Node ABI, node-gyp compiles from source and needs
# python3/make/g++. Installed only in the build stage; the runtime image reuses
# the already-compiled binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install all deps once. Skip audit/fund for speed.
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

# Data directory (SQLite DB + uploaded chart images). Attach a persistent
# volume at /var/data on your host (Railway Volume, Render disk, or a docker
# volume — see docker-compose). NOTE: no Dockerfile VOLUME instruction —
# Railway rejects it; persistence is provided by the platform's mounted volume.
ENV DATA_DIR=/var/data
RUN mkdir -p /var/data

EXPOSE 3001
# JWT_SECRET may be provided at runtime. If it is absent in production, the
# server generates one and persists it next to the database (server/config.ts).
CMD ["npx", "tsx", "server/index.ts"]
