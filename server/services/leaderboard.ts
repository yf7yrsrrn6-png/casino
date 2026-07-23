import { db } from '../db/index.ts'

export type LeaderboardMetric = 'wagered' | 'profit'

export interface LeaderboardEntry {
  userId: string
  displayName: string
  vipLevel: number
  wagered: number
  profit: number
  rounds: number
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function leaderboard(metric: LeaderboardMetric, limit = 20): LeaderboardEntry[] {
  const since = Date.now() - WEEK_MS
  const orderBy = metric === 'profit' ? 'profit' : 'wagered'
  const rows = db
    .prepare(
      `SELECT u.id AS userId, u.display_name AS displayName, u.vip_level AS vipLevel,
              COALESCE(SUM(r.bet), 0) AS wagered,
              COALESCE(SUM(r.payout - r.bet), 0) AS profit,
              COUNT(*) AS rounds
       FROM game_rounds r JOIN users u ON u.id = r.user_id
       WHERE r.created_at >= ?
       GROUP BY r.user_id
       HAVING wagered > 0
       ORDER BY ${orderBy} DESC
       LIMIT ?`,
    )
    .all(since, limit) as LeaderboardEntry[]
  return rows
}
