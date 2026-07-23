import type { Request, Response, NextFunction } from 'express'
import { db } from '../db/index.ts'
import { config } from '../config.ts'
import { verifySession } from '../lib/token.ts'
import type { AuthUser } from '../types.ts'

interface UserRow {
  id: string
  email: string
  display_name: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  self_excluded_until: number | null
}

export function loadUserById(id: string): AuthUser | null {
  const row = db
    .prepare(
      'SELECT id, email, display_name, role, status, self_excluded_until FROM users WHERE id = ?',
    )
    .get(id) as UserRow | undefined
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    selfExcludedUntil: row.self_excluded_until,
  }
}

/** Attaches req.user if a valid session cookie is present; never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookieName]
  if (token) {
    const payload = verifySession(token)
    if (payload) {
      const user = loadUserById(payload.sub)
      if (user) req.user = user
    }
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (req.user.status === 'banned') {
    res.status(403).json({ error: 'account_banned' })
    return
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  next()
}
