import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.ts'

mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db = new Database(config.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/**
 * Ordered, idempotent migrations. Each runs once; applied versions are tracked
 * in schema_migrations so upgrading a deployed DB is safe.
 */
const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',      -- 'user' | 'admin'
        status        TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'banned'
        self_excluded_until INTEGER,                      -- epoch ms, NULL if none
        created_at    INTEGER NOT NULL,
        last_login_at INTEGER
      );

      CREATE TABLE wallets (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance       INTEGER NOT NULL DEFAULT 0,
        total_wagered INTEGER NOT NULL DEFAULT 0,
        total_won     INTEGER NOT NULL DEFAULT 0,
        games_played  INTEGER NOT NULL DEFAULT 0,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE transactions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type          TEXT NOT NULL,   -- deposit | bet | win | bonus | adjustment | refund
        amount        INTEGER NOT NULL, -- signed credits
        balance_after INTEGER NOT NULL,
        label         TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_tx_user ON transactions(user_id, created_at DESC);

      CREATE TABLE game_rounds (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game           TEXT NOT NULL,  -- slots | blackjack | roulette
        game_id        TEXT,           -- specific machine/table id
        bet            INTEGER NOT NULL,
        payout         INTEGER NOT NULL,
        outcome_json   TEXT NOT NULL,
        server_seed    TEXT,
        server_seed_hash TEXT,
        client_seed    TEXT,
        nonce          INTEGER,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX idx_rounds_user ON game_rounds(user_id, created_at DESC);

      CREATE TABLE fair_seeds (
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_seed      TEXT NOT NULL,
        server_seed_hash TEXT NOT NULL,
        client_seed      TEXT NOT NULL,
        nonce            INTEGER NOT NULL DEFAULT 0,
        active           INTEGER NOT NULL DEFAULT 1,
        created_at       INTEGER NOT NULL
      );
      CREATE INDEX idx_seed_user_active ON fair_seeds(user_id, active);

      CREATE TABLE limits (
        user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        deposit_limit_daily     INTEGER,   -- NULL = no limit
        loss_limit_daily        INTEGER,
        max_bet                 INTEGER,
        updated_at              INTEGER NOT NULL
      );

      CREATE TABLE blackjack_games (
        user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_json  TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE audit_log (
        id             TEXT PRIMARY KEY,
        admin_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action         TEXT NOT NULL,
        target_user_id TEXT,
        detail         TEXT,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
    `,
  },
  {
    id: 2,
    name: 'engagement',
    sql: `
      ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN vip_level INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN referral_code TEXT;
      ALTER TABLE users ADD COLUMN referred_by TEXT;
      ALTER TABLE users ADD COLUMN daily_claimed_at INTEGER;
      CREATE INDEX idx_users_referral ON users(referral_code);

      -- Single-row progressive jackpot pool.
      CREATE TABLE jackpot (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        amount     INTEGER NOT NULL,
        seed       INTEGER NOT NULL,
        won_count  INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE promo_codes (
        code            TEXT PRIMARY KEY,
        amount          INTEGER NOT NULL,
        max_redemptions INTEGER,           -- NULL = unlimited
        redemptions     INTEGER NOT NULL DEFAULT 0,
        expires_at      INTEGER,
        active          INTEGER NOT NULL DEFAULT 1,
        created_at      INTEGER NOT NULL
      );

      CREATE TABLE promo_redemptions (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        redeemed_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, code)
      );

      CREATE TABLE notifications (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        title      TEXT NOT NULL,
        body       TEXT,
        read       INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

      CREATE TABLE user_achievements (
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        achievement_id TEXT NOT NULL,
        unlocked_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, achievement_id)
      );
    `,
  },
  {
    id: 3,
    name: 'two_factor',
    sql: `
      ALTER TABLE users ADD COLUMN totp_secret TEXT;
      ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
    `,
  },
]

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);`)

const applied = new Set(
  db
    .prepare('SELECT id FROM schema_migrations')
    .all()
    .map((r) => (r as { id: number }).id),
)

const runMigrations = db.transaction(() => {
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    db.exec(migration.sql)
    db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
      migration.id,
      migration.name,
      Date.now(),
    )
    console.log(`[db] applied migration ${migration.id}: ${migration.name}`)
  }
})
runMigrations()

export function now(): number {
  return Date.now()
}
