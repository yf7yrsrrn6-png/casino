import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'
import { pushToUser } from '../realtime/hub.ts'

export interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  read: number
  created_at: number
}

export function notify(userId: string, type: string, title: string, body?: string): NotificationRow {
  const row: NotificationRow = {
    id: randomUUID(),
    user_id: userId,
    type,
    title,
    body: body ?? null,
    read: 0,
    created_at: now(),
  }
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, read, created_at) VALUES (@id,@user_id,@type,@title,@body,@read,@created_at)',
  ).run(row)
  pushToUser(userId, { type: 'notification', notification: row, unread: unreadCount(userId) })
  return row
}

export function list(userId: string, limit = 30): NotificationRow[] {
  return db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as NotificationRow[]
}

export function unreadCount(userId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(userId) as {
      n: number
    }
  ).n
}

export function markAllRead(userId: string): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId)
}
