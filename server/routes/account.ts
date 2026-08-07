import { Router } from 'express'
import { z } from 'zod'
import { handler, unauthorized } from '../lib/http.ts'
import { parse, passwordSchema } from '../lib/validate.ts'
import { verifyPassword } from '../lib/password.ts'
import { requireAuth } from '../middleware/auth.ts'
import { findById, updatePassword, setDisplayName, publicUser } from '../services/accounts.ts'
import { ensureSettings, publicSettings, updateSettings } from '../services/settings.ts'

export const accountRouter = Router()
accountRouter.use(requireAuth)

accountRouter.get(
  '/profile',
  handler(async (req, res) => {
    const user = findById(req.user!.id)!
    res.json({ user: publicUser(user), settings: publicSettings(ensureSettings(user.id)) })
  }),
)

const changePwSchema = z.object({ currentPassword: z.string(), newPassword: passwordSchema })
accountRouter.post(
  '/password',
  handler(async (req, res) => {
    const { currentPassword, newPassword } = parse(changePwSchema, req.body)
    const user = findById(req.user!.id)!
    if (!verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
      throw unauthorized('invalid_credentials')
    }
    updatePassword(user.id, newPassword)
    res.json({ ok: true })
  }),
)

const nameSchema = z.object({ displayName: z.string().trim().min(1).max(40) })
accountRouter.post(
  '/display-name',
  handler(async (req, res) => {
    const { displayName } = parse(nameSchema, req.body)
    setDisplayName(req.user!.id, displayName)
    res.json({ user: publicUser(findById(req.user!.id)!) })
  }),
)

const quickLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url().max(500),
})
const settingsSchema = z.object({
  accountBalance: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  defaultRiskPct: z.number().min(0).max(100).optional(),
  quickLinks: z.array(quickLinkSchema).max(20).optional(),
  theme: z.enum(['light', 'dark']).optional(),
})
accountRouter.put(
  '/settings',
  handler(async (req, res) => {
    const patch = parse(settingsSchema, req.body)
    res.json({ settings: publicSettings(updateSettings(req.user!.id, patch)) })
  }),
)
