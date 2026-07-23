/**
 * Provably-fair dice: a roll in [0, 100) with two decimals. The player picks a
 * target and a direction (roll under / over). The payout multiplier is derived
 * from the win probability with a 1% house edge, so RTP ≈ 99%.
 */

const HOUSE_EDGE = 0.99
export const MIN_TARGET = 2
export const MAX_TARGET = 98

export interface DiceResult {
  roll: number // 0.00 – 99.99
  target: number
  direction: 'under' | 'over'
  won: boolean
  multiplier: number
  payout: number
}

export function winChance(target: number, direction: 'under' | 'over'): number {
  // "under": win if roll < target  → P = target/100
  // "over":  win if roll > target  → P = (100 - target)/100
  return direction === 'under' ? target / 100 : (100 - target) / 100
}

export function diceMultiplier(target: number, direction: 'under' | 'over'): number {
  const p = winChance(target, direction)
  return Math.max(1.01, Math.floor((HOUSE_EDGE / p) * 100) / 100)
}

export function rollDice(
  bet: number,
  target: number,
  direction: 'under' | 'over',
  draw: number,
): DiceResult {
  const roll = Math.floor(draw * 10000) / 100 // 0.00 – 99.99
  const won = direction === 'under' ? roll < target : roll > target
  const multiplier = diceMultiplier(target, direction)
  return {
    roll,
    target,
    direction,
    won,
    multiplier,
    payout: won ? Math.round(bet * multiplier) : 0,
  }
}
