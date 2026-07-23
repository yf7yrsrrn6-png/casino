import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.ts'

/** Baseline security headers (helmet-lite, no dependency). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-XSS-Protection', '0')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

/**
 * CSRF defense for cookie-authenticated mutations: reject state-changing API
 * calls whose Origin/Referer isn't our own site. Browsers always send Origin on
 * cross-site POSTs, so this blocks forged requests while same-origin fetches
 * (which include no Origin, or our own) pass through.
 */
export function sameOriginMutations(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()

  const origin = req.get('origin')
  if (!origin) return next() // non-browser or same-origin fetch without Origin

  let host: string
  try {
    host = new URL(origin).host
  } catch {
    res.status(403).json({ error: 'bad_origin' })
    return
  }

  const allowed = new Set<string>([req.get('host') ?? ''])
  try {
    allowed.add(new URL(config.clientOrigin).host)
  } catch {
    /* ignore malformed config */
  }

  if (!allowed.has(host)) {
    res.status(403).json({ error: 'cross_origin_denied' })
    return
  }
  next()
}
