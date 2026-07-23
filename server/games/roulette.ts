/** Server-authoritative European roulette (single zero, 37 pockets). */

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
])

export type RouletteBetType =
  | 'straight'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | 'dozen'
  | 'column'

export interface RouletteBet {
  type: RouletteBetType
  value?: number // required for straight (0-36), dozen (1-3), column (1-3)
  amount: number
}

// Multiplier is winnings-to-stake; a winning bet returns amount * (mult + 1).
const MULTIPLIER: Record<RouletteBetType, number> = {
  straight: 35,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
  dozen: 2,
  column: 2,
}

export function colorOf(pocket: number): 'green' | 'red' | 'black' {
  if (pocket === 0) return 'green'
  return RED_NUMBERS.has(pocket) ? 'red' : 'black'
}

function betWins(bet: RouletteBet, pocket: number): boolean {
  if (pocket === 0) return bet.type === 'straight' && bet.value === 0
  switch (bet.type) {
    case 'straight':
      return bet.value === pocket
    case 'red':
      return RED_NUMBERS.has(pocket)
    case 'black':
      return !RED_NUMBERS.has(pocket)
    case 'even':
      return pocket % 2 === 0
    case 'odd':
      return pocket % 2 === 1
    case 'low':
      return pocket >= 1 && pocket <= 18
    case 'high':
      return pocket >= 19 && pocket <= 36
    case 'dozen':
      return bet.value === Math.ceil(pocket / 12)
    case 'column':
      return bet.value === ((pocket - 1) % 3) + 1
    default:
      return false
  }
}

export function validateBet(bet: RouletteBet): boolean {
  if (!Number.isInteger(bet.amount) || bet.amount <= 0) return false
  if (bet.type === 'straight') return Number.isInteger(bet.value) && bet.value! >= 0 && bet.value! <= 36
  if (bet.type === 'dozen' || bet.type === 'column')
    return Number.isInteger(bet.value) && bet.value! >= 1 && bet.value! <= 3
  return true
}

export interface RouletteResult {
  pocket: number
  color: 'green' | 'red' | 'black'
  totalStake: number
  totalPayout: number
  winningBetIndexes: number[]
}

export function spinRoulette(bets: RouletteBet[], next: () => number): RouletteResult {
  const pocket = Math.floor(next() * 37) // 0..36
  const winningBetIndexes: number[] = []
  let totalPayout = 0
  let totalStake = 0

  bets.forEach((bet, i) => {
    totalStake += bet.amount
    if (betWins(bet, pocket)) {
      winningBetIndexes.push(i)
      totalPayout += bet.amount * (MULTIPLIER[bet.type] + 1)
    }
  })

  return { pocket, color: colorOf(pocket), totalStake, totalPayout, winningBetIndexes }
}
