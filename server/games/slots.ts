/**
 * Server-authoritative slot engine. Symbol weights and payouts live here so the
 * client can never influence an outcome — it only animates to what the server
 * returns. Mirrors the client's visual symbol set by id.
 */

export interface SlotSymbol {
  glyph: string
  weight: number
  payout: number
}

export interface SlotConfig {
  id: string
  rtp: number
  symbols: SlotSymbol[]
}

export const REELS = 3
export const ROWS = 3

export const PAYLINES: [number, number][][] = [
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
]

// Payouts are calibrated so the analytical payline RTP lands ~94-97% per machine
// (RTP = Σ (wᵢ/total)³ · payoutᵢ). See the "sampled RTP" unit test.
export const SLOT_CONFIGS: Record<string, SlotConfig> = {
  'classic-777': {
    id: 'classic-777',
    rtp: 95.8,
    symbols: [
      { glyph: 'ruby', weight: 30, payout: 11 },
      { glyph: 'topaz', weight: 26, payout: 16 },
      { glyph: 'emerald', weight: 22, payout: 22 },
      { glyph: 'bell', weight: 14, payout: 43 },
      { glyph: 'star', weight: 6, payout: 110 },
      { glyph: 'seven', weight: 2, payout: 415 },
    ],
  },
  'golden-pharaoh': {
    id: 'golden-pharaoh',
    rtp: 96.7,
    symbols: [
      { glyph: 'topaz', weight: 30, payout: 10 },
      { glyph: 'emerald', weight: 25, payout: 14 },
      { glyph: 'sapphire', weight: 20, payout: 29 },
      { glyph: 'coin', weight: 14, payout: 57 },
      { glyph: 'star', weight: 8, payout: 145 },
      { glyph: 'crown', weight: 3, payout: 570 },
    ],
  },
  'neon-diamonds': {
    id: 'neon-diamonds',
    rtp: 94.3,
    symbols: [
      { glyph: 'sapphire', weight: 32, payout: 8 },
      { glyph: 'amethyst', weight: 24, payout: 16 },
      { glyph: 'emerald', weight: 20, payout: 29 },
      { glyph: 'coin', weight: 13, payout: 62 },
      { glyph: 'star', weight: 8, payout: 145 },
      { glyph: 'diamond', weight: 3, payout: 620 },
    ],
  },
  'wild-safari': {
    id: 'wild-safari',
    rtp: 95.8,
    symbols: [
      { glyph: 'emerald', weight: 30, payout: 9 },
      { glyph: 'topaz', weight: 25, payout: 17 },
      { glyph: 'ruby', weight: 20, payout: 26 },
      { glyph: 'bell', weight: 14, payout: 61 },
      { glyph: 'coin', weight: 8, payout: 120 },
      { glyph: 'crown', weight: 3, payout: 475 },
    ],
  },
  'pirates-gold': {
    id: 'pirates-gold',
    rtp: 95.0,
    symbols: [
      { glyph: 'sapphire', weight: 30, payout: 8 },
      { glyph: 'ruby', weight: 25, payout: 16 },
      { glyph: 'amethyst', weight: 20, payout: 28 },
      { glyph: 'star', weight: 14, payout: 65 },
      { glyph: 'coin', weight: 8, payout: 130 },
      { glyph: 'crown', weight: 3, payout: 565 },
    ],
  },
  'fruit-fiesta': {
    id: 'fruit-fiesta',
    rtp: 94.7,
    symbols: [
      { glyph: 'ruby', weight: 30, payout: 10 },
      { glyph: 'topaz', weight: 26, payout: 15 },
      { glyph: 'emerald', weight: 21, payout: 26 },
      { glyph: 'amethyst', weight: 14, payout: 46 },
      { glyph: 'star', weight: 7, payout: 125 },
      { glyph: 'wild', weight: 2, payout: 460 },
    ],
  },
}

function pickSymbol(symbols: SlotSymbol[], roll: number): SlotSymbol {
  const total = symbols.reduce((sum, s) => sum + s.weight, 0)
  let r = roll * total
  for (const symbol of symbols) {
    r -= symbol.weight
    if (r <= 0) return symbol
  }
  return symbols[symbols.length - 1]
}

export interface SlotResult {
  grid: string[][]
  winningLines: { line: number; glyph: string; payout: number }[]
  totalWin: number
  tier: 'none' | 'win' | 'big' | 'jackpot'
}

export function spinSlot(config: SlotConfig, bet: number, next: () => number): SlotResult {
  const grid: SlotSymbol[][] = Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, () => pickSymbol(config.symbols, next())),
  )

  const perLineBet = bet / PAYLINES.length
  const winningLines: SlotResult['winningLines'] = []

  PAYLINES.forEach((line, index) => {
    const cells = line.map(([reel, row]) => grid[reel][row])
    const [first, ...rest] = cells
    if (rest.every((c) => c.glyph === first.glyph)) {
      winningLines.push({
        line: index,
        glyph: first.glyph,
        payout: Math.round(perLineBet * first.payout),
      })
    }
  })

  const totalWin = winningLines.reduce((sum, w) => sum + w.payout, 0)
  const rarest = winningLines.some((w) => {
    const sym = config.symbols.find((s) => s.glyph === w.glyph)
    return sym != null && sym.weight <= 3
  })
  let tier: SlotResult['tier'] = 'none'
  if (totalWin > 0) {
    tier = totalWin >= bet * 40 || rarest ? 'jackpot' : totalWin >= bet * 10 ? 'big' : 'win'
  }

  return {
    grid: grid.map((reel) => reel.map((s) => s.glyph)),
    winningLines,
    totalWin,
    tier,
  }
}
