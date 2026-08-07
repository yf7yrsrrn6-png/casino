import type { Trade } from '@/lib/api'

function cell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const COLUMNS: { header: string; get: (t: Trade) => unknown }[] = [
  { header: 'Symbol', get: (t) => t.symbol },
  { header: 'Direction', get: (t) => t.direction },
  { header: 'Status', get: (t) => t.status },
  { header: 'Entry', get: (t) => t.entryPrice },
  { header: 'Exit', get: (t) => t.exitPrice },
  { header: 'StopLoss', get: (t) => t.stopLoss },
  { header: 'TakeProfit', get: (t) => t.takeProfit },
  { header: 'Size', get: (t) => t.size },
  { header: 'Risk', get: (t) => t.riskAmount },
  { header: 'PnL', get: (t) => t.pnl },
  { header: 'Fees', get: (t) => t.fees },
  { header: 'R', get: (t) => t.rr },
  { header: 'MAE', get: (t) => t.mae },
  { header: 'MFE', get: (t) => t.mfe },
  { header: 'Confidence', get: (t) => t.confidence },
  { header: 'Rating', get: (t) => t.rating },
  { header: 'Setup', get: (t) => t.setup },
  { header: 'Session', get: (t) => t.session },
  { header: 'Timeframe', get: (t) => t.timeframe },
  { header: 'Emotion', get: (t) => t.emotion },
  { header: 'Tags', get: (t) => t.tags.join(' | ') },
  { header: 'Discipline%', get: (t) => (t.checklist.length ? Math.round((t.checklist.filter((c) => c.done).length / t.checklist.length) * 100) : '') },
  { header: 'Opened', get: (t) => (t.openedAt ? new Date(t.openedAt).toISOString() : '') },
  { header: 'Closed', get: (t) => (t.closedAt ? new Date(t.closedAt).toISOString() : '') },
  { header: 'Plan', get: (t) => t.plan },
  { header: 'Notes', get: (t) => t.notes },
  { header: 'Mistakes', get: (t) => t.mistakes },
]

export function tradesToCsv(trades: Trade[]): string {
  const head = COLUMNS.map((c) => c.header).join(',')
  const rows = trades.map((t) => COLUMNS.map((c) => cell(c.get(t))).join(','))
  return [head, ...rows].join('\n')
}

export function downloadCsv(trades: Trade[], filename = 'trading-journal.csv') {
  const csv = '﻿' + tradesToCsv(trades) // BOM for Excel/Cyrillic
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
