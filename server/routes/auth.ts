import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.ts'
import { handler, unauthorized } from '../lib/http.ts'
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
  userCount,
} from '../services/accounts.ts'

export const authRouter = Router()

const authLimiter = rateLimit({ windowMs: 60_000, max: 30 })

function setSessionCookie(res: import('express').Response, userId: string) {
  const token = signSession({ sub: userId })
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

// Tells the client whether this is a first-run setup (no account yet) or a
// returning login, and whether new registrations are allowed at all.
authRouter.get(
  '/status',
  handler(async (_req, res) => {
    const count = userCount()
    res.json({ needsSetup: count === 0, canRegister: count === 0 || config.openRegistration })
  }),
)

authRouter.post(
  '/register',
  authLimiter,
  handler(async (req, res) => {
    const { email, password, displayName } = parse(credentialsSchema, req.body)
    const user = createUser(email, password, displayName)
    touchLogin(user.id)
    setSessionCookie(res, user.id)
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
    touchLogin(user.id)
    setSessionCookie(res, user.id)
    res.json({ user: publicUser(findById(user.id)!) })
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
    res.json({ user: publicUser(findById(req.user!.id)!) })
  }),
)
