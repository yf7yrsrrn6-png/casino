import { Router } from 'express'
import { z } from 'zod'
import { handler, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  createTrade,
  deleteTrade,
  getTrade,
  listTrades,
  serializeTrade,
  updateTrade,
  computeStats,
  coverMap,
} from '../services/trades.ts'
import { listImagesForTrade, serializeImage } from '../services/images.ts'
import { ensureSettings } from '../services/settings.ts'

export const tradesRouter = Router()
tradesRouter.use(requireAuth)

const num = z.number().finite()
const tradeSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  direction: z.enum(['long', 'short']),
  status: z.enum(['open', 'closed']).optional(),
  entryPrice: num.nullable().optional(),
  exitPrice: num.nullable().optional(),
  stopLoss: num.nullable().optional(),
  takeProfit: num.nullable().optional(),
  size: num.nullable().optional(),
  riskAmount: num.nullable().optional(),
  pnl: num.nullable().optional(),
  fees: num.nullable().optional(),
  rr: num.nullable().optional(),
  session: z.string().trim().max(40).nullable().optional(),
  setup: z.string().trim().max(80).nullable().optional(),
  plan: z.string().max(20000).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  timeframe: z.string().trim().max(20).nullable().optional(),
  emotion: z.string().trim().max(60).nullable().optional(),
  mistakes: z.string().max(2000).nullable().optional(),
  openedAt: z.number().int().nullable().optional(),
  closedAt: z.number().int().nullable().optional(),
})

tradesRouter.get(
  '/',
  handler(async (req, res) => {
    const status = req.query.status === 'open' || req.query.status === 'closed'
      ? req.query.status
      : undefined
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : undefined
    const rows = listTrades(req.user!.id, { status, symbol })
    const covers = coverMap(
      req.user!.id,
      rows.map((r) => r.id),
    )
    const trades = rows.map((r) => serializeTrade(r, covers.get(r.id) ?? null))
    res.json({ trades })
  }),
)

tradesRouter.get(
  '/stats',
  handler(async (req, res) => {
    const settings = ensureSettings(req.user!.id)
    res.json({ stats: computeStats(req.user!.id, settings.account_balance) })
  }),
)

tradesRouter.get(
  '/:id',
  handler(async (req, res) => {
    const trade = getTrade(req.user!.id, String(req.params.id))
    if (!trade) throw notFound('trade_not_found')
    const images = listImagesForTrade(req.user!.id, trade.id).map(serializeImage)
    res.json({ trade: serializeTrade(trade), images })
  }),
)

tradesRouter.post(
  '/',
  handler(async (req, res) => {
    const input = parse(tradeSchema, req.body)
    const trade = createTrade(req.user!.id, input)
    res.status(201).json({ trade: serializeTrade(trade) })
  }),
)

tradesRouter.put(
  '/:id',
  handler(async (req, res) => {
    const input = parse(tradeSchema.partial({ symbol: true, direction: true }), req.body)
    const trade = updateTrade(req.user!.id, String(req.params.id), input as never)
    if (!trade) throw notFound('trade_not_found')
    res.json({ trade: serializeTrade(trade) })
  }),
)

tradesRouter.delete(
  '/:id',
  handler(async (req, res) => {
    if (!deleteTrade(req.user!.id, String(req.params.id))) throw notFound('trade_not_found')
    res.json({ ok: true })
  }),
)
