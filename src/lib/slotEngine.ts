import type { SlotSymbolDef } from '@/types'

export const REELS = 3
export const ROWS = 3

/** [reel, row] coordinates for each of the 5 paylines. */
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

function weightedRandomSymbol(symbols: SlotSymbolDef[]): SlotSymbolDef {
  const total = symbols.reduce((sum, s) => sum + s.weight, 0)
  let roll = Math.random() * total
  for (const symbol of symbols) {
    roll -= symbol.weight
    if (roll <= 0) return symbol
  }
  return symbols[symbols.length - 1]
}

/** grid[reel][row] */
export function spinGrid(symbols: SlotSymbolDef[]): SlotSymbolDef[][] {
  return Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, () => weightedRandomSymbol(symbols)),
  )
}

export interface WinningLine {
  lineIndex: number
  symbol: SlotSymbolDef
  payout: number
}

export interface SpinResult {
  grid: SlotSymbolDef[][]
  winningLines: WinningLine[]
  totalWin: number
}

export function evaluateSpin(grid: SlotSymbolDef[][], bet: number): SpinResult {
  const winningLines: WinningLine[] = []
  const perLineBet = bet / PAYLINES.length

  PAYLINES.forEach((line, lineIndex) => {
    const cells = line.map(([reel, row]) => grid[reel][row])
    const [first, ...rest] = cells
    if (rest.every((cell) => cell.glyph === first.glyph)) {
      winningLines.push({
        lineIndex,
        symbol: first,
        payout: Math.round(perLineBet * first.payout),
      })
    }
  })

  const totalWin = winningLines.reduce((sum, w) => sum + w.payout, 0)
  return { grid, winningLines, totalWin }
}
