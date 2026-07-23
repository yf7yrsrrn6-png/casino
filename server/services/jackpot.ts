import { db, now } from '../db/index.ts'
import { JACKPOT_SEED, JACKPOT_RAKE_BPS, JACKPOT_MIN_BET, JACKPOT_BASE_CHANCE } from '../lib/economy.ts'

function ensureRow() {
  db.prepare('INSERT OR IGNORE INTO jackpot (id, amount, seed, updated_at) VALUES (1, ?, ?, ?)').run(
    JACKPOT_SEED,
    JACKPOT_SEED,
    now(),
  )
}
ensureRow()

export function getJackpot(): number {
  const row = db.prepare('SELECT amount FROM jackpot WHERE id = 1').get() as { amount: number }
  return row.amount
}

/** Add the rake from a bet into the pool. Returns the new pool value. */
export function contribute(bet: number): number {
  const rake = Math.floor((bet * JACKPOT_RAKE_BPS) / 10000)
  if (rake <= 0) return getJackpot()
  db.prepare('UPDATE jackpot SET amount = amount + ?, updated_at = ? WHERE id = 1').run(rake, now())
  return getJackpot()
}

/**
 * Decide whether this bet triggers the progressive jackpot. Chance scales with
 * bet size (bigger bets, better odds) using a provably-fair draw in [0,1).
 */
export function rollJackpot(bet: number, draw: number): { won: boolean; amount: number } {
  if (bet < JACKPOT_MIN_BET) return { won: false, amount: 0 }
  const chance = JACKPOT_BASE_CHANCE * (bet / JACKPOT_MIN_BET)
  if (draw >= chance) return { won: false, amount: 0 }
  const amount = getJackpot()
  db.prepare(
    'UPDATE jackpot SET amount = ?, seed = seed, won_count = won_count + 1, updated_at = ? WHERE id = 1',
  ).run(JACKPOT_SEED, now())
  return { won: true, amount }
}

export function jackpotStats() {
  const row = db.prepare('SELECT amount, won_count FROM jackpot WHERE id = 1').get() as {
    amount: number
    won_count: number
  }
  return { amount: row.amount, wonCount: row.won_count }
}
