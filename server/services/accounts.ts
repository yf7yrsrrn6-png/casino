import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'
import { config } from '../config.ts'
import { hashPassword } from '../lib/password.ts'
import { createWallet } from './wallet.ts'
import { ensureActiveSeed } from './fairness.ts'
import { conflict } from '../lib/http.ts'

export interface FullUserRow {
  id: string
  email: string
  display_name: string
  password_hash: string
  password_salt: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  self_excluded_until: number | null
  created_at: number
  last_login_at: number | null
}

export function findByEmail(email: string): FullUserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
    | FullUserRow
    | undefined
}

export function findById(id: string): FullUserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as FullUserRow | undefined
}

/** Creates the user, their wallet (welcome bonus) and an initial fairness seed atomically. */
export const createUser = db.transaction(
  (email: string, password: string, displayName?: string) => {
    const normalized = email.trim().toLowerCase()
    if (findByEmail(normalized)) throw conflict('email_taken')

    const id = randomUUID()
    const { hash, salt } = hashPassword(password)
    const role = config.adminEmails.includes(normalized) ? 'admin' : 'user'
    const name = displayName?.trim() || normalized.split('@')[0]

    db.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    ).run(id, normalized, name, hash, salt, role, now())

    createWallet(id)
    ensureActiveSeed(id)
    return findById(id)!
  },
)

export function touchLogin(id: string): void {
  // Promote to admin if the email was added to ADMIN_EMAILS after registration.
  const user = findById(id)
  if (user && config.adminEmails.includes(user.email) && user.role !== 'admin') {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', id)
  }
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id)
}

export function updatePassword(id: string, password: string): void {
  const { hash, salt } = hashPassword(password)
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id)
}

export function setDisplayName(id: string, displayName: string): void {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName.trim(), id)
}

export function deleteUser(id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function setSelfExclusion(id: string, until: number | null): void {
  db.prepare('UPDATE users SET self_excluded_until = ? WHERE id = ?').run(until, id)
}

export function publicUser(row: FullUserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    selfExcludedUntil: row.self_excluded_until,
    createdAt: row.created_at,
  }
}
