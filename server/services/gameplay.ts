import { contribute, rollJackpot, getJackpot } from './jackpot.ts'
import { addXp } from './loyalty.ts'
import { award } from './achievements.ts'
import { notify } from './notifications.ts'
import { creditPayout, getWallet } from './wallet.ts'
import { broadcast } from '../realtime/hub.ts'
import { db } from '../db/index.ts'

export interface RoundContext {
  userId: string
  displayName?: string
  game: string
  gameId: string
  bet: number
  payout: number
  /** Provably-fair float in [0,1) used to test the progressive jackpot (slots only). */
  jackpotDraw?: number
  blackjackNatural?: boolean
}

function displayNameOf(userId: string, provided?: string): string {
  if (provided) return provided
  const row = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as
    | { display_name: string }
    | undefined
  return row?.display_name ?? 'Player'
}

export interface RoundExtras {
  jackpotWin: number
  balance: number
  jackpot: number
}

const BIG_WIN_MULT = 20
const WIN_FEED_MIN = 500

/**
 * Shared side-effects every settled round runs through: fund + maybe award the
 * progressive jackpot, accrue VIP XP, unlock achievements, and push the live
 * winners feed. Keeps game routes focused on their own math.
 */
export function afterRound(ctx: RoundContext): RoundExtras {
  const displayName = displayNameOf(ctx.userId, ctx.displayName)
  contribute(ctx.bet)

  let jackpotWin = 0
  if (ctx.jackpotDraw !== undefined) {
    const roll = rollJackpot(ctx.bet, ctx.jackpotDraw)
    if (roll.won) {
      jackpotWin = roll.amount
      creditPayout(ctx.userId, jackpotWin, 'jackpot', 'win')
      award(ctx.userId, 'jackpot_winner')
      notify(ctx.userId, 'jackpot', 'notif.jackpotTitle', String(jackpotWin))
      broadcast({ type: 'jackpotWin', user: displayName, amount: jackpotWin, game: ctx.gameId })
      broadcast({ type: 'jackpot', amount: getJackpot() })
    }
  }

  addXp(ctx.userId, ctx.bet)

  // Achievements.
  const wallet = getWallet(ctx.userId)
  if (ctx.game === 'slots') award(ctx.userId, 'first_spin')
  if (ctx.payout > 0) award(ctx.userId, 'first_win')
  if (ctx.payout >= ctx.bet * BIG_WIN_MULT) award(ctx.userId, 'big_win')
  if (ctx.bet >= 1000) award(ctx.userId, 'high_roller')
  if (ctx.blackjackNatural) award(ctx.userId, 'blackjack_natural')
  if (wallet.games_played >= 100) award(ctx.userId, 'century')

  // Live winners feed for notable payouts.
  const totalWin = ctx.payout + jackpotWin
  if (totalWin >= WIN_FEED_MIN && totalWin >= ctx.bet * 3) {
    broadcast({ type: 'win', user: displayName, amount: totalWin, game: ctx.gameId, at: Date.now() })
  }

  return { jackpotWin, balance: getWallet(ctx.userId).balance, jackpot: getJackpot() }
}
