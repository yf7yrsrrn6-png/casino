import { db, now } from '../db/index.ts'

export interface QuickLink {
  label: string
  url: string
}

export interface SettingsRow {
  user_id: string
  account_balance: number
  currency: string
  default_risk_pct: number
  quick_links: string
  theme: string
  updated_at: number
}

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: 'TradingView', url: 'https://www.tradingview.com/chart/' },
  { label: 'Forex Factory', url: 'https://www.forexfactory.com/calendar' },
]

export function ensureSettings(userId: string): SettingsRow {
  const existing = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as
    | SettingsRow
    | undefined
  if (existing) return existing
  db.prepare(
    `INSERT INTO settings (user_id, account_balance, currency, default_risk_pct, quick_links, theme, updated_at)
     VALUES (?, 10000, 'USD', 1, ?, 'dark', ?)`,
  ).run(userId, JSON.stringify(DEFAULT_QUICK_LINKS), now())
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow
}

export function publicSettings(row: SettingsRow) {
  let quickLinks: QuickLink[] = []
  try {
    quickLinks = JSON.parse(row.quick_links)
  } catch {
    quickLinks = []
  }
  return {
    accountBalance: row.account_balance,
    currency: row.currency,
    defaultRiskPct: row.default_risk_pct,
    quickLinks,
    theme: row.theme,
  }
}

export interface SettingsPatch {
  accountBalance?: number
  currency?: string
  defaultRiskPct?: number
  quickLinks?: QuickLink[]
  theme?: string
}

export function updateSettings(userId: string, patch: SettingsPatch): SettingsRow {
  const current = ensureSettings(userId)
  const next = {
    account_balance: patch.accountBalance ?? current.account_balance,
    currency: patch.currency ?? current.currency,
    default_risk_pct: patch.defaultRiskPct ?? current.default_risk_pct,
    quick_links:
      patch.quickLinks !== undefined ? JSON.stringify(patch.quickLinks) : current.quick_links,
    theme: patch.theme ?? current.theme,
  }
  db.prepare(
    `UPDATE settings SET account_balance = ?, currency = ?, default_risk_pct = ?,
       quick_links = ?, theme = ?, updated_at = ? WHERE user_id = ?`,
  ).run(
    next.account_balance,
    next.currency,
    next.default_risk_pct,
    next.quick_links,
    next.theme,
    now(),
    userId,
  )
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow
}
