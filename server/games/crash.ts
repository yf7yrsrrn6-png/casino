/**
 * Provably-fair "crash": a rocket multiplier climbs from 1.00x and busts at a
 * random point. The player commits a cash-out target up front; if the crash
 * point reaches the target they win bet × target, otherwise they lose the bet.
 * Determining the outcome from the target up front makes it exploit-free while
 * still animating like a live crash game.
 */

const HOUSE_EDGE = 0.99
const INSTANT_BUST_CHANCE = 0.01 // ~1% of rounds bust at 1.00x
export const MAX_MULTIPLIER = 1000

export function crashPoint(draw: number): number {
  if (draw < INSTANT_BUST_CHANCE) return 1.0
  const raw = HOUSE_EDGE / (1 - draw)
  const capped = Math.min(raw, MAX_MULTIPLIER)
  return Math.max(1.0, Math.floor(capped * 100) / 100)
}

export interface CrashResult {
  crashPoint: number
  target: number
  won: boolean
  payout: number
}

export function settleCrash(bet: number, target: number, draw: number): CrashResult {
  const point = crashPoint(draw)
  const won = point >= target
  return {
    crashPoint: point,
    target,
    won,
    payout: won ? Math.round(bet * target) : 0,
  }
}
