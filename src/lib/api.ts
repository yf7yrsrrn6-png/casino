export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message || code)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, err.error ?? 'request_failed', err.message, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

// ---- Shared response types ----

export interface ApiUser {
  id: string
  email: string
  displayName: string
  createdAt: number
}

export type Direction = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'

export interface Trade {
  id: string
  symbol: string
  direction: Direction
  status: TradeStatus
  entryPrice: number | null
  exitPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  size: number | null
  riskAmount: number | null
  pnl: number | null
  fees: number
  rr: number | null
  session: string | null
  setup: string | null
  plan: string | null
  notes: string | null
  rating: number | null
  tags: string[]
  timeframe: string | null
  emotion: string | null
  mistakes: string | null
  checklist: ChecklistItem[]
  confidence: number | null
  mae: number | null
  mfe: number | null
  openedAt: number | null
  closedAt: number | null
  createdAt: number
  updatedAt: number
  coverUrl: string | null
}

export interface ChecklistItem {
  text: string
  done: boolean
}

export interface TradeImage {
  id: string
  tradeId: string | null
  planId: string | null
  mime: string
  caption: string | null
  createdAt: number
  url: string
}

export interface TradeStats {
  totalTrades: number
  openTrades: number
  closedTrades: number
  wins: number
  losses: number
  breakeven: number
  winRate: number
  netPnl: number
  grossProfit: number
  grossLoss: number
  profitFactor: number | null
  avgWin: number
  avgLoss: number
  avgRr: number | null
  expectancy: number
  bestTrade: number
  worstTrade: number
  currentStreak: number
  maxWinStreak: number
  maxLossStreak: number
  maxDrawdown: number
  maxDrawdownPct: number
  avgHoldMinutes: number | null
  expectancyR: number | null
  sqn: number | null
  avgDiscipline: number | null
  equityCurve: { t: number; equity: number; pnl: number }[]
}

export type PlanKind = 'note' | 'playbook' | 'review'

export interface Plan {
  id: string
  title: string
  content: string
  pinned: boolean
  kind: PlanKind
  createdAt: number
  updatedAt: number
}

export interface QuickLink {
  label: string
  url: string
}

export interface Settings {
  accountBalance: number
  currency: string
  defaultRiskPct: number
  quickLinks: QuickLink[]
  theme: 'light' | 'dark'
  checklistTemplate: string[]
}

export type GoalMetric = 'net_pnl' | 'win_rate' | 'trades' | 'avg_rr' | 'profit_factor'
export type GoalPeriod = 'month' | 'quarter' | 'year' | 'all'

export interface Goal {
  id: string
  title: string
  metric: GoalMetric
  target: number
  period: GoalPeriod
  createdAt: number
  updatedAt: number
}

export type Bias = 'long' | 'short' | 'neutral'

export interface WatchItem {
  id: string
  symbol: string
  bias: Bias
  entry: number | null
  target: number | null
  stop: number | null
  note: string | null
  pinned: boolean
  createdAt: number
  updatedAt: number
}
