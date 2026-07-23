/**
 * Provably-fair Keno. The player picks 1–10 numbers from a 1–40 pool; the server
 * draws 10. The payout multiplier is looked up by (picks, hits) from a paytable
 * tuned to ~94% RTP against the hypergeometric distribution.
 */

export const KENO_POOL = 40
export const KENO_DRAWS = 10
export const KENO_MAX_PICKS = 10

// PAYTABLE[picks][hits] → multiplier (0 = no win).
export const KENO_PAYTABLE: Record<number, number[]> = {
  1: [0, 3.8],
  2: [0, 0, 16.3],
  3: [0, 0, 5.3, 17.3],
  4: [0, 0, 0, 20.1, 65.2],
  5: [0, 0, 0, 8.3, 27, 53.9],
  6: [0, 0, 0, 0, 30.8, 100, 199.2],
  7: [0, 0, 0, 0, 14, 45.5, 90.7, 147.9],
  8: [0, 0, 0, 0, 0, 53.8, 174.8, 348.2, 567.9],
  9: [0, 0, 0, 0, 0, 25.6, 83.3, 165.9, 270.6, 395.4],
  10: [0, 0, 0, 0, 0, 0, 106.7, 346.7, 690.7, 1126.3, 1645.9],
}

export interface KenoResult {
  picks: number[]
  drawn: number[]
  hits: number[]
  hitCount: number
  multiplier: number
  payout: number
}

/** Draw `KENO_DRAWS` distinct numbers 1..KENO_POOL via a fair partial shuffle. */
function drawNumbers(next: () => number): number[] {
  const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1)
  for (let i = 0; i < KENO_DRAWS; i++) {
    const j = i + Math.floor(next() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, KENO_DRAWS).sort((a, b) => a - b)
}

export function playKeno(bet: number, picks: number[], next: () => number): KenoResult {
  const drawn = drawNumbers(next)
  const drawnSet = new Set(drawn)
  const hits = picks.filter((p) => drawnSet.has(p))
  const hitCount = hits.length
  const table = KENO_PAYTABLE[picks.length] ?? []
  const multiplier = table[hitCount] ?? 0
  return {
    picks,
    drawn,
    hits,
    hitCount,
    multiplier,
    payout: Math.round(bet * multiplier),
  }
}
