import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Load .env if present (Node 22+ built-in, no dependency).
const envFile = path.join(rootDir, '.env')
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile)
}

const isProd = process.env.NODE_ENV === 'production'

const dbPath = process.env.DB_PATH ?? path.join(rootDir, 'data', 'casino.db')

// A stable-per-process dev secret; production provides its own or gets a
// persisted one generated below.
const devSecret = randomBytes(32).toString('hex')

/**
 * Resolve the session-signing secret.
 * - Explicit JWT_SECRET always wins (recommended for production).
 * - In dev, use an ephemeral per-process secret.
 * - In production without JWT_SECRET (zero-config deploys), generate one once
 *   and persist it next to the database so sessions survive restarts. This
 *   keeps one-click hosting deploys working without any manual configuration.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv) return fromEnv
  if (!isProd) return devSecret
  const dataDir = path.dirname(dbPath)
  const secretFile = path.join(dataDir, '.jwt_secret')
  try {
    if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim()
    mkdirSync(dataDir, { recursive: true })
    const generated = randomBytes(48).toString('hex')
    writeFileSync(secretFile, generated, { mode: 0o600 })
    return generated
  } catch {
    // Last resort: an ephemeral secret (sessions reset on restart).
    return randomBytes(48).toString('hex')
  }
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3001),
  rootDir,
  dbPath,
  jwtSecret: resolveJwtSecret(),
  jwtExpiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  cookieName: 'tml_session',
  startingBalance: Number(process.env.STARTING_BALANCE ?? 10000),
  // Comma-separated list of emails auto-granted admin on registration/login.
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Real-money movement is intentionally disabled. A licensed operator wires a
  // real PaymentProvider and flips this on at go-live. Until then everything is
  // demo credits with no cash value.
  realMoneyEnabled: process.env.REAL_MONEY_ENABLED === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
}

export type AppConfig = typeof config
