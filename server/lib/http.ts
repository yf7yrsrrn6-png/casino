import type { Response } from 'express'

/** A thrown ApiError is turned into a clean JSON error response by the handler wrapper. */
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

export const badRequest = (code = 'bad_request', msg?: string) => new ApiError(400, code, msg)
export const unauthorized = (code = 'unauthorized', msg?: string) => new ApiError(401, code, msg)
export const forbidden = (code = 'forbidden', msg?: string) => new ApiError(403, code, msg)
export const notFound = (code = 'not_found', msg?: string) => new ApiError(404, code, msg)
export const conflict = (code = 'conflict', msg?: string) => new ApiError(409, code, msg)
export const tooMany = (code = 'rate_limited', msg?: string) => new ApiError(429, code, msg)

/** Wrap an async route so thrown errors become JSON instead of crashing. */
export function handler<T>(
  fn: (req: import('express').Request, res: Response) => Promise<T>,
) {
  return async (req: import('express').Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.code, message: err.message })
        return
      }
      console.error('[api] unhandled error:', err)
      res.status(500).json({ error: 'internal_error' })
    }
  }
}
