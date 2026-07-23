import { existsSync } from 'node:fs'
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

function requireInProd(name: string, fallback: string): string {
  const value = process.env[name]
  if (value) return value
  if (isProd) {
    throw new Error(
      `Missing required environment variable ${name} in production. Set it in your environment or .env file.`,
    )
  }
  return fallback
}

// A stable-per-process dev secret; production MUST provide its own.
const devSecret = randomBytes(32).toString('hex')

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3001),
  rootDir,
  dbPath: process.env.DB_PATH ?? path.join(rootDir, 'data', 'casino.db'),
  jwtSecret: requireInProd('JWT_SECRET', devSecret),
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
