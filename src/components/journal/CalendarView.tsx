import { useMemo, useState } from 'react'
import type { Trade } from '@/lib/api'
import { money } from '@/lib/format'
import { IconArrowLeft, IconArrowRight } from '@/components/ui/icons'

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
]
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface DayAgg {
  net: number
  count: number
}

export function CalendarView({
  trades,
  currency,
  onOpen,
}: {
  trades: Trade[]
  currency: string
  onOpen: (id: string) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  // Aggregate closed P&L by calendar day (keyed y-m-d).
  const { byDay, tradesByDay } = useMemo(() => {
    const byDay = new Map<string, DayAgg>()
    const tradesByDay = new Map<string, Trade[]>()
    for (const t of trades) {
      if (t.status !== 'closed' || !t.closedAt) continue
      const d = new Date(t.closedAt)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const net = (t.pnl ?? 0) - (t.fees ?? 0)
      const agg = byDay.get(key) ?? { net: 0, count: 0 }
      agg.net += net
      agg.count += 1
      byDay.set(key, agg)
      const arr = tradesByDay.get(key) ?? []
      arr.push(t)
      tradesByDay.set(key, arr)
    }
    return { byDay, tradesByDay }
  }, [trades])

  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const startOffset = (first.getDay() + 6) % 7 // Monday-first
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const cells: ({ day: number; key: string } | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++)
      cells.push({ day: d, key: `${cursor.y}-${cursor.m}-${d}` })
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const monthTotal = useMemo(() => {
    let net = 0
    let count = 0
    for (const [key, agg] of byDay) {
      const [y, m] = key.split('-').map(Number)
      if (y === cursor.y && m === cursor.m) {
        net += agg.net
        count += agg.count
      }
    }
    return { net, count }
  }, [byDay, cursor])

  // Scale fill intensity by the biggest absolute day in the month.
  const maxAbs = useMemo(() => {
    let max = 1
    for (const [key, agg] of byDay) {
      const [y, m] = key.split('-').map(Number)
      if (y === cursor.y && m === cursor.m) max = Math.max(max, Math.abs(agg.net))
    }
    return max
  }, [byDay, cursor])

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === day

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta
      if (m < 0) return { y: c.y - 1, m: 11 }
      if (m > 11) return { y: c.y + 1, m: 0 }
      return { y: c.y, m }
    })
  }

  return (
    <div className="surface-card rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text"
          >
            <IconArrowLeft width={16} height={16} />
          </button>
          <div className="w-40 text-center text-[15px] font-bold tracking-tight text-text">
            {MONTHS[cursor.m]} {cursor.y}
          </div>
          <button
            onClick={() => shift(1)}
            className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text"
          >
            <IconArrowRight width={16} height={16} />
          </button>
          <button
            onClick={() => {
              const d = new Date()
              setCursor({ y: d.getFullYear(), m: d.getMonth() })
            }}
            className="focus-ring ml-1 h-8 rounded-lg border border-border px-3 text-[12px] font-semibold text-muted hover:text-text"
          >
            Сьогодні
          </button>
        </div>
        <div className="text-right text-[13px]">
          <span className="text-subtle">Місяць: </span>
          <span
            className={`tnum font-bold ${monthTotal.net > 0 ? 'text-profit' : monthTotal.net < 0 ? 'text-loss' : 'text-text'}`}
          >
            {money(monthTotal.net, currency, true)}
          </span>
          <span className="ml-2 text-subtle">· {monthTotal.count} угод</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {w}
          </div>
        ))}
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square rounded-lg" />
          const agg = byDay.get(cell.key)
          const dayTrades = tradesByDay.get(cell.key) ?? []
          const intensity = agg ? Math.min(0.16, (Math.abs(agg.net) / maxAbs) * 0.16) : 0
          const isWin = agg && agg.net > 0
          const isLoss = agg && agg.net < 0
          const bg = agg
            ? isWin
              ? `rgba(255,255,255,${0.05 + intensity})`
              : isLoss
                ? `rgba(255,255,255,${0.02 + intensity * 0.4})`
                : 'var(--surface-2)'
            : 'transparent'
          return (
            <button
              key={i}
              onClick={() => dayTrades[0] && onOpen(dayTrades[0].id)}
              disabled={!agg}
              style={{ background: bg }}
              className={`group relative flex aspect-square flex-col rounded-lg border p-1.5 text-left transition-colors ${
                agg ? 'cursor-pointer hover:border-border-strong' : 'cursor-default'
              } ${isLoss ? 'border-loss/30' : 'border-border'} ${isWin ? 'border-border-strong' : ''}`}
            >
              <span
                className={`text-[11px] font-semibold ${
                  isToday(cell.day)
                    ? 'grid h-5 w-5 place-items-center rounded-full bg-white text-[#0a0b0d]'
                    : 'text-muted'
                }`}
              >
                {cell.day}
              </span>
              {agg && (
                <div className="mt-auto">
                  <div
                    className={`tnum text-[11px] font-bold leading-tight sm:text-[12px] ${
                      isWin ? 'text-profit' : isLoss ? 'text-loss' : 'text-muted'
                    }`}
                  >
                    {agg.net > 0 ? '+' : agg.net < 0 ? '−' : ''}
                    {Math.abs(agg.net) >= 1000
                      ? `${(Math.abs(agg.net) / 1000).toFixed(1)}k`
                      : Math.round(Math.abs(agg.net))}
                  </div>
                  <div className="hidden text-[10px] text-subtle sm:block">{agg.count} угод</div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
