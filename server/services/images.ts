import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { db, now } from '../db/index.ts'
import { config } from '../config.ts'
import { badRequest } from '../lib/http.ts'

mkdirSync(config.uploadsDir, { recursive: true })

export interface ImageRow {
  id: string
  user_id: string
  trade_id: string | null
  plan_id: string | null
  filename: string
  mime: string
  caption: string | null
  created_at: number
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per image

export function serializeImage(row: ImageRow) {
  return {
    id: row.id,
    tradeId: row.trade_id,
    planId: row.plan_id,
    mime: row.mime,
    caption: row.caption,
    createdAt: row.created_at,
    url: `/api/images/${row.id}/raw`,
  }
}

/** Parse a data URL like `data:image/png;base64,AAAA...`. */
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) throw badRequest('invalid_image', 'Expected a base64 data URL')
  const mime = match[1].toLowerCase()
  if (!MIME_EXT[mime]) throw badRequest('unsupported_type', `Unsupported image type: ${mime}`)
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) throw badRequest('empty_image')
  if (buffer.byteLength > MAX_BYTES) throw badRequest('image_too_large', 'Max 10 MB per image')
  return { mime, buffer }
}

export function saveImage(
  userId: string,
  dataUrl: string,
  opts: { tradeId?: string | null; planId?: string | null; caption?: string | null } = {},
): ImageRow {
  const { mime, buffer } = parseDataUrl(dataUrl)
  const id = randomUUID()
  const filename = `${id}.${MIME_EXT[mime]}`
  writeFileSync(path.join(config.uploadsDir, filename), buffer)
  db.prepare(
    `INSERT INTO images (id, user_id, trade_id, plan_id, filename, mime, caption, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    opts.tradeId ?? null,
    opts.planId ?? null,
    filename,
    mime,
    opts.caption ?? null,
    now(),
  )
  return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow
}

export function getImage(userId: string, id: string): ImageRow | undefined {
  return db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(id, userId) as
    | ImageRow
    | undefined
}

export function listImagesForTrade(userId: string, tradeId: string): ImageRow[] {
  return db
    .prepare('SELECT * FROM images WHERE user_id = ? AND trade_id = ? ORDER BY created_at ASC')
    .all(userId, tradeId) as ImageRow[]
}

export function listImagesForPlan(userId: string, planId: string): ImageRow[] {
  return db
    .prepare('SELECT * FROM images WHERE user_id = ? AND plan_id = ? ORDER BY created_at ASC')
    .all(userId, planId) as ImageRow[]
}

export function deleteImage(userId: string, id: string): boolean {
  const row = getImage(userId, id)
  if (!row) return false
  try {
    unlinkSync(path.join(config.uploadsDir, row.filename))
  } catch {
    /* file may already be gone */
  }
  db.prepare('DELETE FROM images WHERE id = ? AND user_id = ?').run(id, userId)
  return true
}

export function imageAbsolutePath(row: ImageRow): string {
  return path.join(config.uploadsDir, row.filename)
}
