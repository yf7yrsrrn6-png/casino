import { db, now } from '../db/index.ts'
import { badRequest, notFound } from '../lib/http.ts'
import {
  buildShoe,
  dealerPlays,
  handValue,
  isBlackjack,
  isBust,
  settlement,
  type Card,
} from '../games/blackjack.ts'
import { debitBet, creditPayout, getWallet, markGamePlayed, assertBetAllowed } from './wallet.ts'
import { nextRandom, publicSeedInfo } from './fairness.ts'
import { recordRound } from './rounds.ts'

interface BjState {
  status: 'player' | 'done'
  bet: number
  doubled: boolean
  shoe: Card[]
  player: Card[]
  dealer: Card[]
  playerNatural: boolean
  result: { outcome: string; payout: number; playerTotal: number; dealerTotal: number } | null
  fair: { serverSeedHash: string; clientSeed: string; nonce: number }
}

function loadState(userId: string): BjState | null {
  const row = db.prepare('SELECT state_json FROM blackjack_games WHERE user_id = ?').get(userId) as
    | { state_json: string }
    | undefined
  return row ? (JSON.parse(row.state_json) as BjState) : null
}

function saveState(userId: string, state: BjState): void {
  db.prepare(
    `INSERT INTO blackjack_games (user_id, state_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).run(userId, JSON.stringify(state), now())
}

function clearState(userId: string): void {
  db.prepare('DELETE FROM blackjack_games WHERE user_id = ?').run(userId)
}

/** Player-facing view: hides the dealer hole card until the hand is resolved. */
function view(userId: string, state: BjState) {
  const dealerVisible =
    state.status === 'done' ? state.dealer : state.dealer.length ? [state.dealer[0]] : []
  return {
    status: state.status,
    bet: state.bet,
    doubled: state.doubled,
    player: state.player,
    dealer: dealerVisible,
    dealerHidden: state.status !== 'done' && state.dealer.length > 1,
    playerTotal: handValue(state.player),
    dealerTotal: state.status === 'done' ? handValue(state.dealer) : handValue(dealerVisible),
    result: state.result,
    canDouble: state.status === 'player' && state.player.length === 2 && !state.doubled,
    balance: getWallet(userId).balance,
    fair: { ...publicSeedInfo(userId), nonce: state.fair.nonce },
  }
}

function finish(userId: string, state: BjState): void {
  const { outcome, payout } = settlement(state.player, state.dealer, state.bet, state.playerNatural)
  if (payout > 0) {
    creditPayout(userId, payout, 'blackjack', outcome === 'push' ? 'refund' : 'win')
  }
  state.status = 'done'
  state.result = {
    outcome,
    payout,
    playerTotal: handValue(state.player),
    dealerTotal: handValue(state.dealer),
  }
  recordRound({
    userId,
    game: 'blackjack',
    gameId: 'blackjack',
    bet: state.bet,
    payout,
    outcome: state.result,
    fair: state.fair,
  })
  saveState(userId, state)
}

export function deal(userId: string, bet: number) {
  const existing = loadState(userId)
  if (existing && existing.status === 'player') throw badRequest('round_in_progress')

  const wallet = getWallet(userId)
  if (wallet.balance < bet) throw badRequest('insufficient_funds')
  assertBetAllowed(userId, bet)

  const { next, meta } = nextRandom(userId)
  const shoe = buildShoe(4, next)
  debitBet(userId, bet, 'blackjack')
  markGamePlayed(userId)

  const player = [shoe.shift()!, shoe.shift()!]
  const dealer = [shoe.shift()!, shoe.shift()!]
  const playerNatural = isBlackjack(player)

  const state: BjState = {
    status: 'player',
    bet,
    doubled: false,
    shoe,
    player,
    dealer,
    playerNatural,
    result: null,
    fair: { serverSeedHash: meta.serverSeedHash, clientSeed: meta.clientSeed, nonce: meta.nonce },
  }

  // Natural blackjack (or dealer natural) resolves immediately.
  if (playerNatural || isBlackjack(dealer)) {
    finish(userId, state)
  } else {
    saveState(userId, state)
  }
  return view(userId, state)
}

export function hit(userId: string) {
  const state = loadState(userId)
  if (!state || state.status !== 'player') throw badRequest('no_active_round')
  state.player.push(state.shoe.shift()!)
  if (isBust(state.player)) {
    finish(userId, state)
  } else {
    saveState(userId, state)
  }
  return view(userId, state)
}

export function stand(userId: string) {
  const state = loadState(userId)
  if (!state || state.status !== 'player') throw badRequest('no_active_round')
  const played = dealerPlays(state.dealer, state.shoe)
  state.dealer = played.dealer
  state.shoe = played.shoe
  finish(userId, state)
  return view(userId, state)
}

export function double(userId: string) {
  const state = loadState(userId)
  if (!state || state.status !== 'player') throw badRequest('no_active_round')
  if (state.player.length !== 2 || state.doubled) throw badRequest('cannot_double')

  const wallet = getWallet(userId)
  if (wallet.balance < state.bet) throw badRequest('insufficient_funds')

  debitBet(userId, state.bet, 'blackjack')
  state.bet *= 2
  state.doubled = true
  state.player.push(state.shoe.shift()!)

  if (isBust(state.player)) {
    finish(userId, state)
  } else {
    const played = dealerPlays(state.dealer, state.shoe)
    state.dealer = played.dealer
    state.shoe = played.shoe
    finish(userId, state)
  }
  return view(userId, state)
}

export function currentState(userId: string) {
  const state = loadState(userId)
  if (!state) throw notFound('no_active_round')
  return view(userId, state)
}

export { clearState }
