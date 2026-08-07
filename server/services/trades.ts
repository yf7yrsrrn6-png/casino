import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'

export interface TradeRow {
  id: string
  user_id: string
  symbol: string
  direction: 'long' | 'short'
  status: 'open' | 'closed'
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  size: number | null
  risk_amount: number | null
  pnl: number | null
  fees: number
  rr: number | null
  session: string | null
  setup: string | null
  plan: string | null
  notes: string | null
  rating: number | null
  tags: string
  timeframe: string | null
  emotion: string | null
  mistakes: string | null
  opened_at: number | null
  closed_at: number | null
  created_at: number
  updated_at: number
}

export interface TradeInput {
  symbol: string
  direction: 'long' | 'short'
  status?: 'open' | 'closed'
  entryPrice?: number | null
  exitPrice?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
  size?: number | null
  riskAmount?: number | null
  pnl?: number | null
  fees?: number | null
  rr?: number | null
  session?: string | null
  setup?: string | null
  plan?: string | null
  notes?: string | null
  rating?: number | null
  tags?: string[]
  timeframe?: string | null
  emotion?: string | null
  mistakes?: string | null
  openedAt?: number | null
  closedAt?: number | null
}

/** Realized R multiple: profit divided by the money risked. */
function computeRR(pnl: number | null | undefined, risk: number | null | undefined): number | null {
  if (pnl == null || risk == null || risk === 0) return null
  return Number((pnl / Math.abs(risk)).toFixed(2))
}

export function serializeTrade(row: TradeRow, coverUrl: string | null = null) {
  let tags: string[] = []
  try {
    tags = JSON.parse(row.tags)
  } catch {
    tags = []
  }
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    status: row.status,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    size: row.size,
    riskAmount: row.risk_amount,
    pnl: row.pnl,
    fees: row.fees,
    rr: row.rr,
    session: row.session,
    setup: row.setup,
    plan: row.plan,
    notes: row.notes,
    rating: row.rating,
    tags,
    timeframe: row.timeframe,
    emotion: row.emotion,
    mistakes: row.mistakes,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverUrl,
  }
}

/** Map of trade id → first attached image URL, for gallery covers/thumbnails. */
export function coverMap(userId: string, tradeIds: string[]): Map<string, string> {
  const map = new Map<string, string>()
  if (!tradeIds.length) return map
  const rows = db
    .prepare(
      `SELECT trade_id, id FROM images
       WHERE user_id = ? AND trade_id IS NOT NULL
       ORDER BY created_at ASC`,
    )
    .all(userId) as { trade_id: string; id: string }[]
  for (const r of rows) {
    if (!map.has(r.trade_id)) map.set(r.trade_id, `/api/images/${r.id}/raw`)
  }
  return map
}

export function listTrades(
  userId: string,
  opts: { status?: 'open' | 'closed'; symbol?: string; limit?: number } = {},
): TradeRow[] {
  const where: string[] = ['user_id = ?']
  const params: unknown[] = [userId]
  if (opts.status) {
    where.push('status = ?')
    params.push(opts.status)
  }
  if (opts.symbol) {
    where.push('symbol = ?')
    params.push(opts.symbol.toUpperCase())
  }
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000)
  return db
    .prepare(
      `SELECT * FROM trades WHERE ${where.join(' AND ')} ORDER BY COALESCE(opened_at, created_at) DESC LIMIT ?`,
    )
    .all(...params, limit) as TradeRow[]
}

export function getTrade(userId: string, id: string): TradeRow | undefined {
  return db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(id, userId) as
    | TradeRow
    | undefined
}

export function createTrade(userId: string, input: TradeInput): TradeRow {
  const id = randomUUID()
  const ts = now()
  const status = input.status ?? 'open'
  const rr = input.rr ?? computeRR(input.pnl, input.riskAmount)
  db.prepare(
    `INSERT INTO trades (
      id, user_id, symbol, direction, status, entry_price, exit_price, stop_loss, take_profit,
      size, risk_amount, pnl, fees, rr, session, setup, plan, notes, rating, tags,
      timeframe, emotion, mistakes, opened_at, closed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.symbol.trim().toUpperCase(),
    input.direction,
    status,
    input.entryPrice ?? null,
    input.exitPrice ?? null,
    input.stopLoss ?? null,
    input.takeProfit ?? null,
    input.size ?? null,
    input.riskAmount ?? null,
    input.pnl ?? null,
    input.fees ?? 0,
    rr,
    input.session ?? null,
    input.setup ?? null,
    input.plan ?? null,
    input.notes ?? null,
    input.rating ?? null,
    JSON.stringify(input.tags ?? []),
    input.timeframe ?? null,
    input.emotion ?? null,
    input.mistakes ?? null,
    input.openedAt ?? ts,
    status === 'closed' ? (input.closedAt ?? ts) : (input.closedAt ?? null),
    ts,
    ts,
  )
  return getTrade(userId, id)!
}

export function updateTrade(
  userId: string,
  id: string,
  input: TradeInput,
): TradeRow | undefined {
  const existing = getTrade(userId, id)
  if (!existing) return undefined
  const status = input.status ?? existing.status
  const pnl = input.pnl !== undefined ? input.pnl : existing.pnl
  const risk = input.riskAmount !== undefined ? input.riskAmount : existing.risk_amount
  const rr = input.rr !== undefined ? input.rr : computeRR(pnl, risk)
  const closedAt =
    input.closedAt !== undefined
      ? input.closedAt
      : status === 'closed'
        ? (existing.closed_at ?? now())
        : null

  db.prepare(
    `UPDATE trades SET
      symbol = ?, direction = ?, status = ?, entry_price = ?, exit_price = ?, stop_loss = ?,
      take_profit = ?, size = ?, risk_amount = ?, pnl = ?, fees = ?, rr = ?, session = ?,
      setup = ?, plan = ?, notes = ?, rating = ?, tags = ?, timeframe = ?, emotion = ?, mistakes = ?,
      opened_at = ?, closed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    input.symbol?.trim().toUpperCase() ?? existing.symbol,
    input.direction ?? existing.direction,
    status,
    input.entryPrice !== undefined ? input.entryPrice : existing.entry_price,
    input.exitPrice !== undefined ? input.exitPrice : existing.exit_price,
    input.stopLoss !== undefined ? input.stopLoss : existing.stop_loss,
    input.takeProfit !== undefined ? input.takeProfit : existing.take_profit,
    input.size !== undefined ? input.size : existing.size,
    risk,
    pnl,
    input.fees !== undefined ? input.fees : existing.fees,
    rr,
    input.session !== undefined ? input.session : existing.session,
    input.setup !== undefined ? input.setup : existing.setup,
    input.plan !== undefined ? input.plan : existing.plan,
    input.notes !== undefined ? input.notes : existing.notes,
    input.rating !== undefined ? input.rating : existing.rating,
    input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    input.timeframe !== undefined ? input.timeframe : existing.timeframe,
    input.emotion !== undefined ? input.emotion : existing.emotion,
    input.mistakes !== undefined ? input.mistakes : existing.mistakes,
    input.openedAt !== undefined ? input.openedAt : existing.opened_at,
    closedAt,
    now(),
    id,
    userId,
  )
  return getTrade(userId, id)
}

export function deleteTrade(userId: string, id: string): boolean {
  const info = db.prepare('DELETE FROM trades WHERE id = ? AND user_id = ?').run(id, userId)
  return info.changes > 0
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
  currentStreak: number // +N winning streak, -N losing streak
  equityCurve: { t: number; equity: number; pnl: number }[]
}

export function computeStats(userId: string, startingBalance: number): TradeStats {
  const closed = db
    .prepare(
      `SELECT * FROM trades WHERE user_id = ? AND status = 'closed' ORDER BY COALESCE(closed_at, created_at) ASC`,
    )
    .all(userId) as TradeRow[]
  const openTrades = (
    db.prepare(`SELECT COUNT(*) AS n FROM trades WHERE user_id = ? AND status = 'open'`).get(
      userId,
    ) as { n: number }
  ).n

  let wins = 0
  let losses = 0
  let breakeven = 0
  let grossProfit = 0
  let grossLoss = 0
  let rrSum = 0
  let rrCount = 0
  let best = 0
  let worst = 0
  const equityCurve: { t: number; equity: number; pnl: number }[] = []
  let equity = startingBalance
  equityCurve.push({ t: closed[0]?.closed_at ?? Date.now(), equity, pnl: 0 })

  for (const t of closed) {
    const net = (t.pnl ?? 0) - (t.fees ?? 0)
    if (net > 0) {
      wins++
      grossProfit += net
    } else if (net < 0) {
      losses++
      grossLoss += Math.abs(net)
    } else {
      breakeven++
    }
    if (net > best) best = net
    if (net < worst) worst = net
    if (t.rr != null) {
      rrSum += t.rr
      rrCount++
    }
    equity += net
    equityCurve.push({ t: t.closed_at ?? t.created_at, equity, pnl: net })
  }

  const closedTrades = closed.length
  const winRate = closedTrades ? (wins / closedTrades) * 100 : 0
  const netPnl = grossProfit - grossLoss
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0
  const avgWin = wins ? grossProfit / wins : 0
  const avgLoss = losses ? grossLoss / losses : 0
  const expectancy = closedTrades ? netPnl / closedTrades : 0

  // Current win/loss streak from the most recent closed trades.
  let streak = 0
  for (let i = closed.length - 1; i >= 0; i--) {
    const net = (closed[i].pnl ?? 0) - (closed[i].fees ?? 0)
    if (net === 0) break
    const dir = net > 0 ? 1 : -1
    if (streak === 0) streak = dir
    else if (Math.sign(streak) === dir) streak += dir
    else break
  }

  return {
    totalTrades: closedTrades + openTrades,
    openTrades,
    closedTrades,
    wins,
    losses,
    breakeven,
    winRate: Number(winRate.toFixed(1)),
    netPnl: Number(netPnl.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    profitFactor: profitFactor == null ? null : Number(profitFactor.toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    avgRr: rrCount ? Number((rrSum / rrCount).toFixed(2)) : null,
    expectancy: Number(expectancy.toFixed(2)),
    bestTrade: Number(best.toFixed(2)),
    worstTrade: Number(worst.toFixed(2)),
    currentStreak: streak,
    equityCurve,
  }
}
