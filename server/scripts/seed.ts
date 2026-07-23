/**
 * Seed the database with demo players, some gameplay history (for the
 * leaderboard) and extra promo codes. Safe to re-run — it skips users that
 * already exist. Usage: npm run seed
 */
import { db } from '../db/index.ts'
import { createUser, findByEmail } from '../services/accounts.ts'
import { settleRound } from '../services/wallet.ts'
import { addXp } from '../services/loyalty.ts'
import { recordRound } from '../services/rounds.ts'
import { now } from '../db/index.ts'

const DEMO_USERS = [
  { email: 'alice@demo.tml', name: 'Alice' },
  { email: 'bob@demo.tml', name: 'Bob' },
  { email: 'carol@demo.tml', name: 'Carol' },
  { email: 'dave@demo.tml', name: 'Dave' },
  { email: 'erin@demo.tml', name: 'Erin' },
]

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

let created = 0
for (const u of DEMO_USERS) {
  if (findByEmail(u.email)) continue
  const user = createUser(u.email, 'password123', u.name)
  created++

  // Simulate a week of play so leaderboards and VIP have data.
  const rounds = rand(30, 120)
  for (let i = 0; i < rounds; i++) {
    const bet = [25, 50, 100, 250][rand(0, 3)]
    const win = Math.random() < 0.35 ? Math.round(bet * (1 + Math.random() * 4)) : 0
    try {
      settleRound({ userId: user.id, bet, payout: win, label: 'seed' })
      addXp(user.id, bet)
      recordRound({
        userId: user.id,
        game: ['slots', 'roulette', 'blackjack'][rand(0, 2)] as 'slots',
        gameId: 'seed',
        bet,
        payout: win,
        outcome: { seed: true },
      })
    } catch {
      break // ran out of balance
    }
  }
}

// Extra promo codes for demos.
const promos = [
  { code: 'BONUS100', amount: 10000, max: 100 },
  { code: 'HIGHROLLER', amount: 50000, max: 25 },
]
for (const p of promos) {
  const exists = db.prepare('SELECT 1 FROM promo_codes WHERE code = ?').get(p.code)
  if (!exists) {
    db.prepare(
      `INSERT INTO promo_codes (code, amount, max_redemptions, redemptions, active, created_at)
       VALUES (?, ?, ?, 0, 1, ?)`,
    ).run(p.code, p.amount, p.max, now())
  }
}

console.log(`[seed] created ${created} demo users (password: password123) and ensured promo codes.`)
console.log('[seed] demo logins: alice@demo.tml … erin@demo.tml')
process.exit(0)
