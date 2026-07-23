import { db, now } from '../db/index.ts'
import { badRequest, forbidden, notFound } from '../lib/http.ts'
import {
  tierForXp,
  nextTier,
  dailyBonusAmount,
  DAILY_COOLDOWN_MS,
  VIP_TIERS,
} from '../lib/economy.ts'
import { deposit } from './wallet.ts'
import { notify } from './notifications.ts'
import { award } from './achievements.ts'

interface XpRow {
  xp: number
  vip_level: number
  daily_claimed_at: number | null
}

function xpRow(userId: string): XpRow {
  return db.prepare('SELECT xp, vip_level, daily_claimed_at FROM users WHERE id = ?').get(userId) as XpRow
}

/** Accrue XP from a wager and handle level-ups (notification + achievements). */
export function addXp(userId: string, amount: number): void {
  if (amount <= 0) return
  const before = xpRow(userId)
  const xp = before.xp + amount
  const tier = tierForXp(xp)
  db.prepare('UPDATE users SET xp = ?, vip_level = ? WHERE id = ?').run(xp, tier.level, userId)

  if (tier.level > before.vip_level) {
    notify(userId, 'levelup', 'notif.levelUpTitle', tier.name)
    if (tier.level >= 1) award(userId, 'vip_bronze')
    if (tier.level >= 3) award(userId, 'vip_gold')
  }
}

export function getVip(userId: string) {
  const row = xpRow(userId)
  const tier = tierForXp(row.xp)
  const next = nextTier(tier.level)
  const floor = tier.minXp
  const ceil = next?.minXp ?? tier.minXp
  const progress = next ? Math.min(1, (row.xp - floor) / (ceil - floor)) : 1
  return {
    xp: row.xp,
    level: tier.level,
    tierName: tier.name,
    rakebackBps: tier.rakebackBps,
    next: next ? { level: next.level, name: next.name, minXp: next.minXp } : null,
    progress,
    tiers: VIP_TIERS.map((t) => ({ level: t.level, name: t.name, minXp: t.minXp })),
  }
}

export function dailyStatus(userId: string) {
  const row = xpRow(userId)
  const available = !row.daily_claimed_at || now() - row.daily_claimed_at >= DAILY_COOLDOWN_MS
  const nextAt = row.daily_claimed_at ? row.daily_claimed_at + DAILY_COOLDOWN_MS : now()
  return { available, amount: dailyBonusAmount(row.vip_level), nextAt }
}

export function claimDaily(userId: string): { amount: number; balance: number; nextAt: number } {
  const row = xpRow(userId)
  if (row.daily_claimed_at && now() - row.daily_claimed_at < DAILY_COOLDOWN_MS) {
    throw forbidden('daily_on_cooldown')
  }
  const amount = dailyBonusAmount(row.vip_level)
  db.prepare('UPDATE users SET daily_claimed_at = ? WHERE id = ?').run(now(), userId)
  const { balance } = deposit(userId, amount, 'bonus', 'daily_bonus')
  notify(userId, 'bonus', 'notif.dailyTitle', String(amount))
  return { amount, balance, nextAt: now() + DAILY_COOLDOWN_MS }
}

export function redeemPromo(userId: string, rawCode: string): { amount: number; balance: number } {
  const code = rawCode.trim().toUpperCase()
  const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code) as
    | {
        code: string
        amount: number
        max_redemptions: number | null
        redemptions: number
        expires_at: number | null
        active: number
      }
    | undefined
  if (!promo || !promo.active) throw notFound('promo_invalid')
  if (promo.expires_at && promo.expires_at < now()) throw badRequest('promo_expired')
  if (promo.max_redemptions != null && promo.redemptions >= promo.max_redemptions) {
    throw badRequest('promo_exhausted')
  }
  const already = db
    .prepare('SELECT 1 FROM promo_redemptions WHERE user_id = ? AND code = ?')
    .get(userId, code)
  if (already) throw badRequest('promo_already_used')

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO promo_redemptions (user_id, code, redeemed_at) VALUES (?, ?, ?)').run(
      userId,
      code,
      now(),
    )
    db.prepare('UPDATE promo_codes SET redemptions = redemptions + 1 WHERE code = ?').run(code)
  })
  tx()
  const { balance } = deposit(userId, promo.amount, 'bonus', `promo:${code}`)
  notify(userId, 'bonus', 'notif.promoTitle', String(promo.amount))
  return { amount: promo.amount, balance }
}
