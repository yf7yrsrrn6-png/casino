import type { Request, Response, NextFunction } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Small in-memory fixed-window rate limiter. Good enough for a single-node
 * deployment; swap for a Redis-backed limiter when scaling horizontally.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const buckets = new Map<string, Bucket>()
  const keyFn = options.key ?? ((req: Request) => req.ip ?? 'unknown')

  // Periodically drop expired buckets so the map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, options.windowMs)
  sweep.unref?.()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req)
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'rate_limited', retryAfter })
      return
    }
    next()
  }
}
