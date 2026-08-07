import { Router } from 'express'
import { z } from 'zod'
import { handler, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { createGoal, deleteGoal, listGoals, serializeGoal, updateGoal } from '../services/goals.ts'

export const goalsRouter = Router()
goalsRouter.use(requireAuth)

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  metric: z.enum(['net_pnl', 'win_rate', 'trades', 'avg_rr', 'profit_factor']),
  target: z.number().finite(),
  period: z.enum(['month', 'quarter', 'year', 'all']).optional(),
})
const updateSchema = createSchema.partial()

goalsRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({ goals: listGoals(req.user!.id).map(serializeGoal) })
  }),
)

goalsRouter.post(
  '/',
  handler(async (req, res) => {
    const input = parse(createSchema, req.body)
    res.status(201).json({ goal: serializeGoal(createGoal(req.user!.id, input)) })
  }),
)

goalsRouter.put(
  '/:id',
  handler(async (req, res) => {
    const input = parse(updateSchema, req.body)
    const goal = updateGoal(req.user!.id, String(req.params.id), input)
    if (!goal) throw notFound('goal_not_found')
    res.json({ goal: serializeGoal(goal) })
  }),
)

goalsRouter.delete(
  '/:id',
  handler(async (req, res) => {
    if (!deleteGoal(req.user!.id, String(req.params.id))) throw notFound('goal_not_found')
    res.json({ ok: true })
  }),
)
