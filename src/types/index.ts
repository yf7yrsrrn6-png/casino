export interface TransactionRecord {
  id: string
  type: 'deposit' | 'bet' | 'win' | 'bonus'
  amount: number
  balanceAfter: number
  date: number
  label?: string
}

export interface WalletData {
  balance: number
  transactions: TransactionRecord[]
  totalWagered: number
  totalWon: number
  gamesPlayed: number
  createdAt: number
}

export interface AccountRecord {
  passwordHash: string
  createdAt: number
}

export type SlotVolatility = 'low' | 'medium' | 'high'

export interface SlotSymbolDef {
  glyph: string
  weight: number
  payout: number
  name: string
}

export type SlotCategory = 'slots' | 'jackpot'
export type SlotBadge = 'new' | 'hot' | null

export interface SlotDefinition {
  id: string
  name: string
  themeFrom: string
  themeTo: string
  accent: string
  icon: string
  rtp: number
  volatility: SlotVolatility
  category: SlotCategory
  provider: string
  badge: SlotBadge
  tagline: string
  symbols: SlotSymbolDef[]
}
