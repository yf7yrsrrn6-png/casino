import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'

export type PlanKind = 'note' | 'playbook' | 'review'

export interface PlanRow {
  id: string
  user_id: string
  title: string
  content: string
  pinned: number
  kind: string
  created_at: number
  updated_at: number
}

export function serializePlan(row: PlanRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    pinned: row.pinned === 1,
    kind: (row.kind ?? 'note') as PlanKind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listPlans(userId: string): PlanRow[] {
  return db
    .prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC')
    .all(userId) as PlanRow[]
}

export function getPlan(userId: string, id: string): PlanRow | undefined {
  return db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(id, userId) as
    | PlanRow
    | undefined
}

export function createPlan(
  userId: string,
  title: string,
  content = '',
  kind: PlanKind = 'note',
): PlanRow {
  const id = randomUUID()
  const ts = now()
  db.prepare(
    'INSERT INTO plans (id, user_id, title, content, pinned, kind, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
  ).run(id, userId, title.trim() || 'Untitled', content, kind, ts, ts)
  return getPlan(userId, id)!
}

export function updatePlan(
  userId: string,
  id: string,
  patch: { title?: string; content?: string; pinned?: boolean },
): PlanRow | undefined {
  const existing = getPlan(userId, id)
  if (!existing) return undefined
  db.prepare('UPDATE plans SET title = ?, content = ?, pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    patch.title !== undefined ? patch.title.trim() || 'Untitled plan' : existing.title,
    patch.content !== undefined ? patch.content : existing.content,
    patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : existing.pinned,
    now(),
    id,
    userId,
  )
  return getPlan(userId, id)
}

export function deletePlan(userId: string, id: string): boolean {
  const info = db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(id, userId)
  return info.changes > 0
}
