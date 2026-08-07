import { Router } from 'express'
import { z } from 'zod'
import { handler, notFound } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  serializePlan,
  updatePlan,
} from '../services/plans.ts'
import { listImagesForPlan, serializeImage } from '../services/images.ts'

export const plansRouter = Router()
plansRouter.use(requireAuth)

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().max(50000).optional(),
  kind: z.enum(['note', 'playbook', 'review']).optional(),
})
const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(50000).optional(),
  pinned: z.boolean().optional(),
})

plansRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({ plans: listPlans(req.user!.id).map(serializePlan) })
  }),
)

plansRouter.get(
  '/:id',
  handler(async (req, res) => {
    const plan = getPlan(req.user!.id, String(req.params.id))
    if (!plan) throw notFound('plan_not_found')
    const images = listImagesForPlan(req.user!.id, plan.id).map(serializeImage)
    res.json({ plan: serializePlan(plan), images })
  }),
)

plansRouter.post(
  '/',
  handler(async (req, res) => {
    const { title, content, kind } = parse(createSchema, req.body)
    res.status(201).json({ plan: serializePlan(createPlan(req.user!.id, title, content, kind)) })
  }),
)

plansRouter.put(
  '/:id',
  handler(async (req, res) => {
    const patch = parse(updateSchema, req.body)
    const plan = updatePlan(req.user!.id, String(req.params.id), patch)
    if (!plan) throw notFound('plan_not_found')
    res.json({ plan: serializePlan(plan) })
  }),
)

plansRouter.delete(
  '/:id',
  handler(async (req, res) => {
    if (!deletePlan(req.user!.id, String(req.params.id))) throw notFound('plan_not_found')
    res.json({ ok: true })
  }),
)
