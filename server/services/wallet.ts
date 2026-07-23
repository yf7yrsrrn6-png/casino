import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'
import { config } from '../config.ts'
import { ApiError, badRequest, forbidden } from '../lib/http.ts'

export type TxType = 'deposit' | 'bet' | 'win' | 'bonus' | 'adjustment' | 'refund'

export interface WalletRow {
  user_id: string
  balance: number
  total_wagered: number
  total_won: number
  games_played: number
  updated_at: number
}

export interface TransactionRow {
  id: string
  user_id: string
  type: TxType
  amount: number
  balance_after: number
  label: string | null
  created_at: number
}

const selectWallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?')
const insertTx = db.prepare(
  `INSERT INTO transactions (id, user_id, type, amount, balance_after, label, created_at)
   VALUES (@id, @user_id, @type, @amount, @balance_after, @label, @created_at)`,
)

export function getWallet(userId: string): WalletRow {
  const wallet = selectWallet.get(userId) as WalletRow | undefined
  if (!wallet) throw new ApiError(404, 'wallet_not_found')
  return wallet
}

export function createWallet(userId: string, bonus = config.startingBalance): void {
  const ts = now()
  db.prepare(
    `INSERT INTO wallets (user_id, balance, total_wagered, total_won, games_played, updated_at)
     VALUES (?, ?, 0, 0, 0, ?)`,
  ).run(userId, bonus, ts)
  if (bonus > 0) {
    insertTx.run({
      id: randomUUID(),
      user_id: userId,
      type: 'bonus',
      amount: bonus,
      balance_after: bonus,
      label: 'welcome_bonus',
      created_at: ts,
    })
  }
}

function writeTx(
  userId: string,
  type: TxType,
  amount: number,
  balanceAfter: number,
  label: string | null,
): TransactionRow {
  const row: TransactionRow = {
    id: randomUUID(),
    user_id: userId,
    type,
    amount,
    balance_after: balanceAfter,
    label,
    created_at: now(),
  }
  insertTx.run(row)
  return row
}

/** Credit demo funds (deposit/bonus/adjustment/refund). Atomic. */
export const deposit = db.transaction(
  (userId: string, amount: number, type: TxType = 'deposit', label: string | null = null) => {
    if (!Number.isInteger(amount) || amount <= 0) throw badRequest('invalid_amount')
    const wallet = getWallet(userId)
    const balance = wallet.balance + amount
    db.prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(
      balance,
      now(),
      userId,
    )
    const tx = writeTx(userId, type, amount, balance, label)
    return { balance, tx }
  },
)

/**
 * Atomically settle a game round: debit the bet, then credit the payout (if any),
 * updating wager/win aggregates. Returns the resulting balance. Rejects if the
 * player cannot cover the bet — the single source of truth for affordability.
 */
export const settleRound = db.transaction(
  (params: { userId: string; bet: number; payout: number; label: string }) => {
    const { userId, bet, payout, label } = params
    if (!Number.isInteger(bet) || bet <= 0) throw badRequest('invalid_bet')
    if (!Number.isInteger(payout) || payout < 0) throw badRequest('invalid_payout')

    const wallet = getWallet(userId)
    if (wallet.balance < bet) throw badRequest('insufficient_funds')

    const afterBet = wallet.balance - bet
    db.prepare(
      `UPDATE wallets
         SET balance = ?, total_wagered = total_wagered + ?, games_played = games_played + 1, updated_at = ?
       WHERE user_id = ?`,
    ).run(afterBet, bet, now(), userId)
    const betTx = writeTx(userId, 'bet', -bet, afterBet, label)

    let balance = afterBet
    let winTx: TransactionRow | null = null
    if (payout > 0) {
      balance = afterBet + payout
      db.prepare(
        'UPDATE wallets SET balance = ?, total_won = total_won + ?, updated_at = ? WHERE user_id = ?',
      ).run(balance, payout, now(), userId)
      winTx = writeTx(userId, 'win', payout, balance, label)
    }
    return { balance, betTx, winTx, wagerBefore: wallet.balance }
  },
)

/** Debit only (e.g. placing a blackjack bet before the round resolves). */
export const debitBet = db.transaction((userId: string, bet: number, label: string) => {
  if (!Number.isInteger(bet) || bet <= 0) throw badRequest('invalid_bet')
  const wallet = getWallet(userId)
  if (wallet.balance < bet) throw badRequest('insufficient_funds')
  const balance = wallet.balance - bet
  db.prepare(
    `UPDATE wallets SET balance = ?, total_wagered = total_wagered + ?, updated_at = ? WHERE user_id = ?`,
  ).run(balance, bet, now(), userId)
  const tx = writeTx(userId, 'bet', -bet, balance, label)
  return { balance, tx }
})

/** Credit a win/refund without touching wager aggregates (bet already counted). */
export const creditPayout = db.transaction(
  (userId: string, amount: number, label: string, type: TxType = 'win') => {
    if (!Number.isInteger(amount) || amount <= 0) return { balance: getWallet(userId).balance }
    const wallet = getWallet(userId)
    const balance = wallet.balance + amount
    const wonDelta = type === 'win' ? amount : 0
    db.prepare(
      'UPDATE wallets SET balance = ?, total_won = total_won + ?, updated_at = ? WHERE user_id = ?',
    ).run(balance, wonDelta, now(), userId)
    const tx = writeTx(userId, type, amount, balance, label)
    return { balance, tx }
  },
)

/** Count games_played increment for a round that was bet elsewhere (blackjack deal). */
export function markGamePlayed(userId: string): void {
  db.prepare('UPDATE wallets SET games_played = games_played + 1, updated_at = ? WHERE user_id = ?').run(
    now(),
    userId,
  )
}

export function resetToStarting(userId: string): WalletRow {
  const ts = now()
  db.prepare(
    `UPDATE wallets SET balance = ?, total_wagered = 0, total_won = 0, games_played = 0, updated_at = ?
     WHERE user_id = ?`,
  ).run(config.startingBalance, ts, userId)
  db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId)
  writeTx(userId, 'bonus', config.startingBalance, config.startingBalance, 'reset')
  return getWallet(userId)
}

export function listTransactions(userId: string, limit = 100): TransactionRow[] {
  return db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as TransactionRow[]
}

/** Net loss (wagered − won) since local midnight, used for daily loss limits. */
export function netLossToday(userId: string): number {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const since = startOfDay.getTime()
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='bet' THEN -amount ELSE 0 END), 0) AS wagered,
         COALESCE(SUM(CASE WHEN type='win' THEN amount ELSE 0 END), 0) AS won
       FROM transactions WHERE user_id = ? AND created_at >= ?`,
    )
    .get(userId, since) as { wagered: number; won: number }
  return row.wagered - row.won
}

export interface LimitsRow {
  user_id: string
  deposit_limit_daily: number | null
  loss_limit_daily: number | null
  max_bet: number | null
  updated_at: number
}

export function getLimits(userId: string): LimitsRow | null {
  return (db.prepare('SELECT * FROM limits WHERE user_id = ?').get(userId) as LimitsRow) ?? null
}

/** Enforce responsible-gambling limits before accepting a bet. */
export function assertBetAllowed(userId: string, bet: number): void {
  const limits = getLimits(userId)
  if (!limits) return
  if (limits.max_bet != null && bet > limits.max_bet) {
    throw forbidden('bet_over_limit', `Bet exceeds your max-bet limit of ${limits.max_bet}.`)
  }
  if (limits.loss_limit_daily != null) {
    const projected = netLossToday(userId) + bet
    if (projected > limits.loss_limit_daily) {
      throw forbidden('loss_limit_reached', 'Daily loss limit reached. Come back tomorrow.')
    }
  }
}
