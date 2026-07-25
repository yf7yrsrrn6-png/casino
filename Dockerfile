# Multi-stage build for the TakeMyLucky full-stack app.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install all deps (better-sqlite3 ships prebuilt binaries for this platform).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build           # type-check + build the SPA into /app/dist

# --- Runtime image ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production deps at runtime; tsx is needed to run the TS server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx@4

COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig.json ./

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
