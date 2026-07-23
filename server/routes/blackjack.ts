import { Router } from 'express'
import { z } from 'zod'
import { handler } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { requirePlayable } from '../middleware/playable.ts'
import { deal, hit, stand, double, currentState } from '../services/blackjack.ts'

export const blackjackRouter = Router()
blackjackRouter.use(requireAuth, requirePlayable)

const dealSchema = z.object({ bet: z.number().int().positive().max(1_000_000) })

blackjackRouter.get(
  '/state',
  handler(async (req, res) => {
    res.json(currentState(req.user!.id))
  }),
)

blackjackRouter.post(
  '/deal',
  handler(async (req, res) => {
    const { bet } = parse(dealSchema, req.body)
    res.json(deal(req.user!.id, bet))
  }),
)

blackjackRouter.post(
  '/hit',
  handler(async (req, res) => {
    res.json(hit(req.user!.id))
  }),
)

blackjackRouter.post(
  '/stand',
  handler(async (req, res) => {
    res.json(stand(req.user!.id))
  }),
)

blackjackRouter.post(
  '/double',
  handler(async (req, res) => {
    res.json(double(req.user!.id))
  }),
)
