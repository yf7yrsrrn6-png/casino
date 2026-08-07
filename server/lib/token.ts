import jwt from 'jsonwebtoken'
import { config } from '../config.ts'

export interface SessionPayload {
  sub: string // user id
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresInSeconds,
  })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    if (typeof decoded === 'object' && decoded && 'sub' in decoded) {
      return { sub: String(decoded.sub) }
    }
    return null
  } catch {
    return null
  }
}
