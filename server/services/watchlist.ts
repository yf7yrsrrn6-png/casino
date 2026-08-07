import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'

export type Bias = 'long' | 'short' | 'neutral'

export interface WatchRow {
  id: string
  user_id: string
  symbol: string
  bias: Bias
  entry: number | null
  target: number | null
  stop: number | null
  note: string | null
  pinned: number
  created_at: number
  updated_at: number
}

export interface WatchInput {
  symbol?: string
  bias?: Bias
  entry?: number | null
  target?: number | null
  stop?: number | null
  note?: string | null
  pinned?: boolean
}

export function serializeWatch(row: WatchRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    bias: row.bias,
    entry: row.entry,
    target: row.target,
    stop: row.stop,
    note: row.note,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listWatch(userId: string): WatchRow[] {
  return db
    .prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC')
    .all(userId) as WatchRow[]
}

export function getWatch(userId: string, id: string): WatchRow | undefined {
  return db.prepare('SELECT * FROM watchlist WHERE id = ? AND user_id = ?').get(id, userId) as
    | WatchRow
    | undefined
}

export function createWatch(userId: string, input: WatchInput): WatchRow {
  const id = randomUUID()
  const ts = now()
  db.prepare(
    `INSERT INTO watchlist (id, user_id, symbol, bias, entry, target, stop, note, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    (input.symbol ?? '').trim().toUpperCase(),
    input.bias ?? 'neutral',
    input.entry ?? null,
    input.target ?? null,
    input.stop ?? null,
    input.note ?? null,
    input.pinned ? 1 : 0,
    ts,
    ts,
  )
  return getWatch(userId, id)!
}

export function updateWatch(userId: string, id: string, input: WatchInput): WatchRow | undefined {
  const existing = getWatch(userId, id)
  if (!existing) return undefined
  db.prepare(
    `UPDATE watchlist SET symbol = ?, bias = ?, entry = ?, target = ?, stop = ?, note = ?, pinned = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    input.symbol?.trim().toUpperCase() ?? existing.symbol,
    input.bias ?? existing.bias,
    input.entry !== undefined ? input.entry : existing.entry,
    input.target !== undefined ? input.target : existing.target,
    input.stop !== undefined ? input.stop : existing.stop,
    input.note !== undefined ? input.note : existing.note,
    input.pinned !== undefined ? (input.pinned ? 1 : 0) : existing.pinned,
    now(),
    id,
    userId,
  )
  return getWatch(userId, id)
}

export function deleteWatch(userId: string, id: string): boolean {
  return db.prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
}
