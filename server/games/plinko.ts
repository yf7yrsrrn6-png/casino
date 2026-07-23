/**
 * Provably-fair Plinko. A ball falls through 12 rows of pegs; at each row a fair
 * bit sends it left or right. The final bucket is the number of right-moves
 * (binomial), and its multiplier comes from a risk-tuned table. Tables are
 * scaled so RTP ≈ 98%.
 */

export const PLINKO_ROWS = 12
export type PlinkoRisk = 'low' | 'medium' | 'high'

export const PLINKO_TABLES: Record<PlinkoRisk, number[]> = {
  low: [7.77, 2.91, 1.46, 1.17, 1.07, 0.97, 0.68, 0.97, 1.07, 1.17, 1.46, 2.91, 7.77],
  medium: [29.97, 7.49, 2.75, 1.5, 1, 0.75, 0.62, 0.75, 1, 1.5, 2.75, 7.49, 29.97],
  high: [162.31, 24.97, 6.24, 1.87, 0.62, 0.37, 0.25, 0.37, 0.62, 1.87, 6.24, 24.97, 162.31],
}

export interface PlinkoResult {
  path: ('L' | 'R')[]
  bucket: number
  multiplier: number
  payout: number
  risk: PlinkoRisk
}

export function dropPlinko(
  bet: number,
  risk: PlinkoRisk,
  next: () => number,
): PlinkoResult {
  const path: ('L' | 'R')[] = []
  let bucket = 0
  for (let row = 0; row < PLINKO_ROWS; row++) {
    if (next() >= 0.5) {
      path.push('R')
      bucket += 1
    } else {
      path.push('L')
    }
  }
  const multiplier = PLINKO_TABLES[risk][bucket]
  return { path, bucket, multiplier, payout: Math.round(bet * multiplier), risk }
}
