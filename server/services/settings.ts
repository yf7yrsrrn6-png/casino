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
  checklist_template: string | null
  updated_at: number
}

const DEFAULT_CHECKLIST: string[] = [
  'Тренд і структура на боці угоди',
  'Є чітка зона входу (POI)',
  'Стоп за структурою, ризик ≤ мого ліміту',
  'R:R щонайменше 1:2',
  'Немає новин високої важливості найближчим часом',
  'Це мій сетап із плейбука, не імпульс',
]

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
    `INSERT INTO settings (user_id, account_balance, currency, default_risk_pct, quick_links, theme, checklist_template, updated_at)
     VALUES (?, 10000, 'USD', 1, ?, 'dark', ?, ?)`,
  ).run(userId, JSON.stringify(DEFAULT_QUICK_LINKS), JSON.stringify(DEFAULT_CHECKLIST), now())
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow
}

export function publicSettings(row: SettingsRow) {
  let quickLinks: QuickLink[] = []
  try {
    quickLinks = JSON.parse(row.quick_links)
  } catch {
    quickLinks = []
  }
  let checklistTemplate: string[] = DEFAULT_CHECKLIST
  if (row.checklist_template) {
    try {
      const parsed = JSON.parse(row.checklist_template)
      if (Array.isArray(parsed)) checklistTemplate = parsed.map(String)
    } catch {
      /* keep default */
    }
  }
  return {
    accountBalance: row.account_balance,
    currency: row.currency,
    defaultRiskPct: row.default_risk_pct,
    quickLinks,
    theme: row.theme,
    checklistTemplate,
  }
}

export interface SettingsPatch {
  accountBalance?: number
  currency?: string
  defaultRiskPct?: number
  quickLinks?: QuickLink[]
  theme?: string
  checklistTemplate?: string[]
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
    checklist_template:
      patch.checklistTemplate !== undefined
        ? JSON.stringify(patch.checklistTemplate)
        : current.checklist_template,
  }
  db.prepare(
    `UPDATE settings SET account_balance = ?, currency = ?, default_risk_pct = ?,
       quick_links = ?, theme = ?, checklist_template = ?, updated_at = ? WHERE user_id = ?`,
  ).run(
    next.account_balance,
    next.currency,
    next.default_risk_pct,
    next.quick_links,
    next.theme,
    next.checklist_template,
    now(),
    userId,
  )
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow
}
