import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { db, now } from '../db/index.ts'
import { handler, notFound, badRequest } from '../lib/http.ts'
import { parse } from '../lib/validate.ts'
import { requireAuth, requireAdmin } from '../middleware/auth.ts'
import { deposit, getWallet, listTransactions } from '../services/wallet.ts'
import { listRounds } from '../services/rounds.ts'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

function audit(adminId: string, action: string, targetUserId: string | null, detail: string) {
  db.prepare(
    'INSERT INTO audit_log (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), adminId, action, targetUserId, detail, now())
}

adminRouter.get(
  '/stats',
  handler(async (_req, res) => {
    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE role='admin') AS admins,
           (SELECT COUNT(*) FROM users WHERE status='banned') AS banned,
           (SELECT COALESCE(SUM(balance),0) FROM wallets) AS creditsInPlay,
           (SELECT COUNT(*) FROM game_rounds) AS rounds`,
      )
      .get()
    res.json({ stats: totals })
  }),
)

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

adminRouter.get(
  '/users',
  handler(async (req, res) => {
    const { q, limit = 25, offset = 0 } = parse(listSchema, req.query)
    const where = q ? 'WHERE u.email LIKE ? OR u.display_name LIKE ?' : ''
    const params: unknown[] = q ? [`%${q}%`, `%${q}%`] : []
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.role, u.status, u.self_excluded_until,
                u.created_at, u.last_login_at, w.balance, w.total_wagered, w.total_won, w.games_played
         FROM users u LEFT JOIN wallets w ON w.user_id = u.id
         ${where}
         ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(...params) as { n: number }
    ).n
    res.json({ users: rows, total })
  }),
)

adminRouter.get(
  '/users/:id',
  handler(async (req, res) => {
    const id = String(req.params.id)
    const user = db
      .prepare(
        `SELECT id, email, display_name, role, status, self_excluded_until, created_at, last_login_at
         FROM users WHERE id = ?`,
      )
      .get(id)
    if (!user) throw notFound('user_not_found')
    res.json({
      user,
      wallet: getWallet(id),
      transactions: listTransactions(id, 50),
      rounds: listRounds(id, 25),
    })
  }),
)

const adjustSchema = z.object({ amount: z.number().int().refine((n) => n !== 0), note: z.string().max(120).optional() })
adminRouter.post(
  '/users/:id/adjust',
  handler(async (req, res) => {
    const id = String(req.params.id)
    const { amount, note } = parse(adjustSchema, req.body)
    const wallet = getWallet(id) // throws if missing
    if (amount < 0 && wallet.balance + amount < 0) throw badRequest('would_go_negative')
    if (amount > 0) {
      deposit(id, amount, 'adjustment', note ?? 'admin_credit')
    } else {
      // Negative adjustment: debit via a direct ledger entry.
      const balance = wallet.balance + amount
      db.prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(balance, now(), id)
      db.prepare(
        `INSERT INTO transactions (id, user_id, type, amount, balance_after, label, created_at)
         VALUES (?, ?, 'adjustment', ?, ?, ?, ?)`,
      ).run(randomUUID(), id, amount, balance, note ?? 'admin_debit', now())
    }
    audit(req.user!.id, 'adjust_balance', id, `${amount} ${note ?? ''}`.trim())
    res.json({ wallet: getWallet(id) })
  }),
)

const statusSchema = z.object({ status: z.enum(['active', 'banned']) })
adminRouter.post(
  '/users/:id/status',
  handler(async (req, res) => {
    const id = String(req.params.id)
    const { status } = parse(statusSchema, req.body)
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as
      | { role: string }
      | undefined
    if (!target) throw notFound('user_not_found')
    if (target.role === 'admin') throw badRequest('cannot_ban_admin')
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id)
    audit(req.user!.id, 'set_status', id, status)
    res.json({ ok: true, status })
  }),
)

adminRouter.get(
  '/audit',
  handler(async (_req, res) => {
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all()
    res.json({ audit: rows })
  }),
)
