import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.ts'
import { handler, unauthorized, forbidden } from '../lib/http.ts'
import { parse, emailSchema, passwordSchema } from '../lib/validate.ts'
import { verifyPassword } from '../lib/password.ts'
import { signSession } from '../lib/token.ts'
import { rateLimit } from '../middleware/rateLimit.ts'
import { requireAuth } from '../middleware/auth.ts'
import {
  createUser,
  findByEmail,
  findById,
  publicUser,
  touchLogin,
} from '../services/accounts.ts'

export const authRouter = Router()

const authLimiter = rateLimit({ windowMs: 60_000, max: 20 })

function setSessionCookie(res: import('express').Response, userId: string, role: 'user' | 'admin') {
  const token = signSession({ sub: userId, role })
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.jwtExpiresInSeconds * 1000,
    path: '/',
  })
}

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(40).optional(),
})

authRouter.post(
  '/register',
  authLimiter,
  handler(async (req, res) => {
    const { email, password, displayName } = parse(credentialsSchema, req.body)
    const user = createUser(email, password, displayName)
    touchLogin(user.id)
    setSessionCookie(res, user.id, user.role)
    res.status(201).json({ user: publicUser(user) })
  }),
)

authRouter.post(
  '/login',
  authLimiter,
  handler(async (req, res) => {
    const { email, password } = parse(credentialsSchema.omit({ displayName: true }), req.body)
    const user = findByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      throw unauthorized('invalid_credentials')
    }
    if (user.status === 'banned') throw forbidden('account_banned')
    touchLogin(user.id)
    const fresh = findById(user.id)!
    setSessionCookie(res, fresh.id, fresh.role)
    res.json({ user: publicUser(fresh) })
  }),
)

authRouter.post(
  '/logout',
  handler(async (_req, res) => {
    res.clearCookie(config.cookieName, { path: '/' })
    res.json({ ok: true })
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const user = findById(req.user!.id)!
    res.json({ user: publicUser(user) })
  }),
)
