import type { Goal, GoalMetric, GoalPeriod, Trade } from '@/lib/api'

export const METRIC_LABEL: Record<GoalMetric, string> = {
  net_pnl: 'Чистий P&L',
  win_rate: 'Вінрейт',
  trades: 'Кількість угод',
  avg_rr: 'Середній R',
  profit_factor: 'Profit Factor',
}

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  month: 'Цей місяць',
  quarter: 'Цей квартал',
  year: 'Цей рік',
  all: 'Увесь час',
}

function net(t: Trade) {
  return (t.pnl ?? 0) - (t.fees ?? 0)
}

/** Start timestamp for a goal period. */
export function periodStart(period: GoalPeriod): number {
  const d = new Date()
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  if (period === 'quarter')
    return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime()
  if (period === 'year') return new Date(d.getFullYear(), 0, 1).getTime()
  return 0
}

export interface GoalProgress {
  current: number
  target: number
  pct: number // 0..100 (capped)
  reached: boolean
  display: string // formatted current
  targetDisplay: string
}

export function computeGoalProgress(goal: Goal, trades: Trade[], currency: string): GoalProgress {
  const since = periodStart(goal.period)
  const closed = trades.filter(
    (t) => t.status === 'closed' && (t.closedAt ?? t.createdAt) >= since,
  )
  const wins = closed.filter((t) => net(t) > 0)
  const losses = closed.filter((t) => net(t) < 0)

  let current = 0
  switch (goal.metric) {
    case 'net_pnl':
      current = closed.reduce((s, t) => s + net(t), 0)
      break
    case 'win_rate':
      current = closed.length ? (wins.length / closed.length) * 100 : 0
      break
    case 'trades':
      current = closed.length
      break
    case 'avg_rr': {
      const rs = closed.map((t) => t.rr).filter((r): r is number => r != null)
      current = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0
      break
    }
    case 'profit_factor': {
      const gp = wins.reduce((s, t) => s + net(t), 0)
      const gl = Math.abs(losses.reduce((s, t) => s + net(t), 0))
      current = gl > 0 ? gp / gl : gp > 0 ? gp : 0
      break
    }
  }

  const pct = goal.target !== 0 ? Math.max(0, Math.min(100, (current / goal.target) * 100)) : 0

  const fmtMoney = (v: number) =>
    `${v < 0 ? '−' : ''}${currency === 'USD' ? '$' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}${currency !== 'USD' ? ' ' + currency : ''}`
  const fmt = (v: number): string => {
    switch (goal.metric) {
      case 'net_pnl':
        return fmtMoney(v)
      case 'win_rate':
        return `${v.toFixed(0)}%`
      case 'trades':
        return `${Math.round(v)}`
      case 'avg_rr':
        return `${v.toFixed(2)}R`
      case 'profit_factor':
        return v.toFixed(2)
    }
  }

  return {
    current,
    target: goal.target,
    pct,
    reached: current >= goal.target,
    display: fmt(current),
    targetDisplay: fmt(goal.target),
  }
}
