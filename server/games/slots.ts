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

export const SLOT_CONFIGS: Record<string, SlotConfig> = {
  'classic-777': {
    id: 'classic-777',
    rtp: 96.2,
    symbols: [
      { glyph: '🍋', weight: 30, payout: 2 },
      { glyph: '🍇', weight: 26, payout: 3 },
      { glyph: '🍒', weight: 22, payout: 4 },
      { glyph: '🔔', weight: 14, payout: 8 },
      { glyph: '⭐', weight: 6, payout: 20 },
      { glyph: '7', weight: 2, payout: 77 },
    ],
  },
  'golden-pharaoh': {
    id: 'golden-pharaoh',
    rtp: 96.8,
    symbols: [
      { glyph: '📜', weight: 30, payout: 2 },
      { glyph: '🏺', weight: 25, payout: 3 },
      { glyph: '🐫', weight: 20, payout: 6 },
      { glyph: '🐍', weight: 14, payout: 12 },
      { glyph: '👁️', weight: 8, payout: 30 },
      { glyph: '👑', weight: 3, payout: 120 },
    ],
  },
  'neon-diamonds': {
    id: 'neon-diamonds',
    rtp: 95.9,
    symbols: [
      { glyph: '🔷', weight: 32, payout: 2 },
      { glyph: '⚡', weight: 24, payout: 4 },
      { glyph: '🪙', weight: 20, payout: 7 },
      { glyph: '🎰', weight: 13, payout: 15 },
      { glyph: '💠', weight: 8, payout: 35 },
      { glyph: '💎', weight: 3, payout: 150 },
    ],
  },
  'wild-safari': {
    id: 'wild-safari',
    rtp: 96.5,
    symbols: [
      { glyph: '🦓', weight: 30, payout: 2 },
      { glyph: '🐘', weight: 25, payout: 4 },
      { glyph: '🦒', weight: 20, payout: 6 },
      { glyph: '🐆', weight: 14, payout: 14 },
      { glyph: '🦍', weight: 8, payout: 28 },
      { glyph: '🦁', weight: 3, payout: 110 },
    ],
  },
  'pirates-gold': {
    id: 'pirates-gold',
    rtp: 96.1,
    symbols: [
      { glyph: '⚓', weight: 30, payout: 2 },
      { glyph: '🦜', weight: 25, payout: 4 },
      { glyph: '🗺️', weight: 20, payout: 7 },
      { glyph: '☠️', weight: 14, payout: 16 },
      { glyph: '🧭', weight: 8, payout: 32 },
      { glyph: '💰', weight: 3, payout: 140 },
    ],
  },
  'fruit-fiesta': {
    id: 'fruit-fiesta',
    rtp: 96.4,
    symbols: [
      { glyph: '🍌', weight: 30, payout: 2 },
      { glyph: '🍓', weight: 26, payout: 3 },
      { glyph: '🍍', weight: 21, payout: 5 },
      { glyph: '🥝', weight: 14, payout: 9 },
      { glyph: '🍉', weight: 7, payout: 24 },
      { glyph: '✨', weight: 2, payout: 90 },
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
