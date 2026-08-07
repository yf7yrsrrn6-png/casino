import 'express'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}
