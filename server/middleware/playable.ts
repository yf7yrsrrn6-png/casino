import type { Request, Response, NextFunction } from 'express'

/** Blocks gameplay while a self-exclusion / cool-off period is active. */
export function requirePlayable(req: Request, res: Response, next: NextFunction) {
  const until = req.user?.selfExcludedUntil
  if (until && until > Date.now()) {
    res.status(403).json({ error: 'self_excluded', until })
    return
  }
  next()
}
