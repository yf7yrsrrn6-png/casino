import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'

export type GoalMetric = 'net_pnl' | 'win_rate' | 'trades' | 'avg_rr' | 'profit_factor'
export type GoalPeriod = 'month' | 'quarter' | 'year' | 'all'

export interface GoalRow {
  id: string
  user_id: string
  title: string
  metric: string
  target: number
  period: string
  created_at: number
  updated_at: number
}

export interface GoalInput {
  title?: string
  metric?: GoalMetric
  target?: number
  period?: GoalPeriod
}

export function serializeGoal(row: GoalRow) {
  return {
    id: row.id,
    title: row.title,
    metric: row.metric as GoalMetric,
    target: row.target,
    period: row.period as GoalPeriod,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listGoals(userId: string): GoalRow[] {
  return db
    .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as GoalRow[]
}

export function getGoal(userId: string, id: string): GoalRow | undefined {
  return db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId) as
    | GoalRow
    | undefined
}

export function createGoal(userId: string, input: GoalInput): GoalRow {
  const id = randomUUID()
  const ts = now()
  db.prepare(
    `INSERT INTO goals (id, user_id, title, metric, target, period, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    (input.title ?? 'Ціль').trim() || 'Ціль',
    input.metric ?? 'net_pnl',
    input.target ?? 0,
    input.period ?? 'month',
    ts,
    ts,
  )
  return getGoal(userId, id)!
}

export function updateGoal(userId: string, id: string, input: GoalInput): GoalRow | undefined {
  const existing = getGoal(userId, id)
  if (!existing) return undefined
  db.prepare(
    `UPDATE goals SET title = ?, metric = ?, target = ?, period = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    input.title !== undefined ? input.title.trim() || 'Ціль' : existing.title,
    input.metric ?? existing.metric,
    input.target !== undefined ? input.target : existing.target,
    input.period ?? existing.period,
    now(),
    id,
    userId,
  )
  return getGoal(userId, id)
}

export function deleteGoal(userId: string, id: string): boolean {
  return db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
}
