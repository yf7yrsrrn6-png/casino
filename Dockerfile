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

# Persist the SQLite database on a mounted volume.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3001
# JWT_SECRET must be provided at runtime (see .env.example).
CMD ["npx", "tsx", "server/index.ts"]
