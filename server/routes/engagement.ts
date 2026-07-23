import { Router } from 'express'
import { z } from 'zod'
import { handler } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth } from '../middleware/auth.ts'
import { getVip, dailyStatus, claimDaily, redeemPromo } from '../services/loyalty.ts'
import { list, unreadCount, markAllRead } from '../services/notifications.ts'
import { ACHIEVEMENTS, unlocked } from '../services/achievements.ts'
import { leaderboard } from '../services/leaderboard.ts'
import { jackpotStats } from '../services/jackpot.ts'

export const engagementRouter = Router()

// Public: current progressive jackpot (used on the landing page).
engagementRouter.get(
  '/jackpot',
  handler(async (_req, res) => {
    res.json(jackpotStats())
  }),
)

// Public: weekly leaderboards.
engagementRouter.get(
  '/leaderboard',
  handler(async (req, res) => {
    const metric = req.query.metric === 'profit' ? 'profit' : 'wagered'
    res.json({ metric, entries: leaderboard(metric, 20) })
  }),
)

engagementRouter.use(requireAuth)

engagementRouter.get(
  '/vip',
  handler(async (req, res) => {
    res.json(getVip(req.user!.id))
  }),
)

engagementRouter.get(
  '/daily',
  handler(async (req, res) => {
    res.json(dailyStatus(req.user!.id))
  }),
)

engagementRouter.post(
  '/daily/claim',
  handler(async (req, res) => {
    res.json(claimDaily(req.user!.id))
  }),
)

const promoSchema = z.object({ code: z.string().trim().min(1).max(40) })
engagementRouter.post(
  '/promo',
  handler(async (req, res) => {
    const { code } = parse(promoSchema, req.body)
    res.json(redeemPromo(req.user!.id, code))
  }),
)

engagementRouter.get(
  '/notifications',
  handler(async (req, res) => {
    res.json({ notifications: list(req.user!.id, 30), unread: unreadCount(req.user!.id) })
  }),
)

engagementRouter.post(
  '/notifications/read',
  handler(async (req, res) => {
    markAllRead(req.user!.id)
    res.json({ ok: true })
  }),
)

engagementRouter.get(
  '/achievements',
  handler(async (req, res) => {
    const done = new Map(unlocked(req.user!.id).map((u) => [u.id, u.unlocked_at]))
    res.json({
      achievements: ACHIEVEMENTS.map((a) => ({
        ...a,
        unlocked: done.has(a.id),
        unlockedAt: done.get(a.id) ?? null,
      })),
    })
  }),
)
