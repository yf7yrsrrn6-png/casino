import 'express'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  selfExcludedUntil: number | null
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}
