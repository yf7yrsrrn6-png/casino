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
        created_at    INTEGER NOT NULL,
        last_login_at INTEGER
      );

      -- Per-user preferences that also feed the calculators (account balance,
      -- default risk %, currency) and the quick-link launcher.
      CREATE TABLE settings (
        user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        account_balance REAL NOT NULL DEFAULT 10000,
        currency        TEXT NOT NULL DEFAULT 'USD',
        default_risk_pct REAL NOT NULL DEFAULT 1,
        quick_links     TEXT NOT NULL DEFAULT '[]',  -- JSON [{label,url}]
        theme           TEXT NOT NULL DEFAULT 'light',
        updated_at      INTEGER NOT NULL
      );

      -- Standalone trading plans / playbooks (markdown notes).
      CREATE TABLE plans (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        pinned     INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_plans_user ON plans(user_id, pinned DESC, updated_at DESC);

      -- Positions / trades journal.
      CREATE TABLE trades (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT NOT NULL,
        direction    TEXT NOT NULL,                    -- 'long' | 'short'
        status       TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'closed'
        entry_price  REAL,
        exit_price   REAL,
        stop_loss    REAL,
        take_profit  REAL,
        size         REAL,                             -- lots / units
        risk_amount  REAL,                             -- money risked
        pnl          REAL,                             -- realized P&L (money)
        fees         REAL NOT NULL DEFAULT 0,
        rr           REAL,                             -- realized R multiple
        session      TEXT,                             -- london / ny / asia ...
        setup        TEXT,                             -- strategy / setup name
        plan         TEXT,                             -- pre-trade plan (markdown)
        notes        TEXT,                             -- post-trade review (markdown)
        rating       INTEGER,                          -- 1..5 self rating
        tags         TEXT NOT NULL DEFAULT '[]',       -- JSON string[]
        opened_at    INTEGER,
        closed_at    INTEGER,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_trades_user ON trades(user_id, created_at DESC);
      CREATE INDEX idx_trades_status ON trades(user_id, status);

      -- Uploaded chart screenshots / analysis images, attached to a trade or a plan.
      CREATE TABLE images (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        trade_id   TEXT REFERENCES trades(id) ON DELETE CASCADE,
        plan_id    TEXT REFERENCES plans(id) ON DELETE CASCADE,
        filename   TEXT NOT NULL,                      -- stored file on disk
        mime       TEXT NOT NULL,
        caption    TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_images_trade ON images(trade_id);
      CREATE INDEX idx_images_plan ON images(plan_id);
    `,
  },
  {
    id: 2,
    name: 'trade_psychology',
    sql: `
      ALTER TABLE trades ADD COLUMN timeframe TEXT;
      ALTER TABLE trades ADD COLUMN emotion   TEXT;
      ALTER TABLE trades ADD COLUMN mistakes  TEXT;
    `,
  },
  {
    id: 3,
    name: 'checklist_mae_watchlist',
    sql: `
      -- Pre-trade discipline checklist (JSON [{text,done}]) + confidence.
      ALTER TABLE trades ADD COLUMN checklist  TEXT;
      ALTER TABLE trades ADD COLUMN confidence INTEGER;         -- 1..5 pre-trade
      -- Maximum adverse / favourable excursion (as price levels reached).
      ALTER TABLE trades ADD COLUMN mae        REAL;
      ALTER TABLE trades ADD COLUMN mfe        REAL;

      -- Default checklist items used to prefill new trades (JSON string[]).
      ALTER TABLE settings ADD COLUMN checklist_template TEXT;

      -- Watchlist: instruments to keep an eye on, with a bias and levels.
      CREATE TABLE watchlist (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol     TEXT NOT NULL,
        bias       TEXT NOT NULL DEFAULT 'neutral',  -- long | short | neutral
        entry      REAL,
        target     REAL,
        stop       REAL,
        note       TEXT,
        pinned     INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_watchlist_user ON watchlist(user_id, pinned DESC, updated_at DESC);
    `,
  },
  {
    id: 4,
    name: 'plan_kind',
    sql: `
      -- Classify knowledge-base pages: free notes, strategy playbooks, or reviews.
      ALTER TABLE plans ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'; -- note | playbook | review
    `,
  },
  {
    id: 5,
    name: 'goals',
    sql: `
      -- Performance goals with progress tracked against a period's trades.
      CREATE TABLE goals (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        metric     TEXT NOT NULL,                 -- net_pnl | win_rate | trades | avg_rr | profit_factor
        target     REAL NOT NULL,
        period     TEXT NOT NULL DEFAULT 'month',  -- month | quarter | year | all
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_goals_user ON goals(user_id, created_at DESC);
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
