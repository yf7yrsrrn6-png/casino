import { Router } from 'express'
import { z } from 'zod'
import { handler, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  createWatch,
  deleteWatch,
  listWatch,
  serializeWatch,
  updateWatch,
} from '../services/watchlist.ts'

export const watchlistRouter = Router()
watchlistRouter.use(requireAuth)

const num = z.number().finite()
const createSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  bias: z.enum(['long', 'short', 'neutral']).optional(),
  entry: num.nullable().optional(),
  target: num.nullable().optional(),
  stop: num.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  pinned: z.boolean().optional(),
})
const updateSchema = createSchema.partial()

watchlistRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({ items: listWatch(req.user!.id).map(serializeWatch) })
  }),
)

watchlistRouter.post(
  '/',
  handler(async (req, res) => {
    const input = parse(createSchema, req.body)
    res.status(201).json({ item: serializeWatch(createWatch(req.user!.id, input)) })
  }),
)

watchlistRouter.put(
  '/:id',
  handler(async (req, res) => {
    const input = parse(updateSchema, req.body)
    const item = updateWatch(req.user!.id, String(req.params.id), input)
    if (!item) throw notFound('watch_not_found')
    res.json({ item: serializeWatch(item) })
  }),
)

watchlistRouter.delete(
  '/:id',
  handler(async (req, res) => {
    if (!deleteWatch(req.user!.id, String(req.params.id))) throw notFound('watch_not_found')
    res.json({ ok: true })
  }),
)
