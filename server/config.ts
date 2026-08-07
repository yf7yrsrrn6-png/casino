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

const dataDir = process.env.DATA_DIR ?? path.join(rootDir, 'data')
const dbPath = process.env.DB_PATH ?? path.join(dataDir, 'journal.db')
const uploadsDir = process.env.UPLOADS_DIR ?? path.join(dataDir, 'uploads')

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
  const secretFile = path.join(path.dirname(dbPath), '.jwt_secret')
  try {
    if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim()
    mkdirSync(path.dirname(dbPath), { recursive: true })
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
  dataDir,
  dbPath,
  uploadsDir,
  jwtSecret: resolveJwtSecret(),
  jwtExpiresInSeconds: 60 * 60 * 24 * 30, // 30 days — personal app, stay logged in
  cookieName: 'tj_session',
  // Personal single-user journal: once the owner registers, sign-up is closed.
  // Set OPEN_REGISTRATION=true to allow additional accounts.
  openRegistration: process.env.OPEN_REGISTRATION === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
}

export type AppConfig = typeof config
