import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'
import { hashPassword } from '../lib/password.ts'
import { conflict, forbidden } from '../lib/http.ts'
import { config } from '../config.ts'
import { ensureSettings } from './settings.ts'

export interface FullUserRow {
  id: string
  email: string
  display_name: string
  password_hash: string
  password_salt: string
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

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
}

/** Creates the user and their default settings atomically. */
export const createUser = db.transaction(
  (email: string, password: string, displayName?: string) => {
    const normalized = email.trim().toLowerCase()
    if (findByEmail(normalized)) throw conflict('email_taken')
    // Personal journal: only the first account may be created unless the owner
    // explicitly opts into open registration.
    if (userCount() > 0 && !config.openRegistration) throw forbidden('registration_closed')

    const id = randomUUID()
    const { hash, salt } = hashPassword(password)
    const name = displayName?.trim() || normalized.split('@')[0]

    db.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, normalized, name, hash, salt, now())

    ensureSettings(id)
    return findById(id)!
  },
)

export function touchLogin(id: string): void {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id)
}

export function updatePassword(id: string, password: string): void {
  const { hash, salt } = hashPassword(password)
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
    hash,
    salt,
    id,
  )
}

export function setDisplayName(id: string, displayName: string): void {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName.trim(), id)
}

export function publicUser(row: FullUserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}
