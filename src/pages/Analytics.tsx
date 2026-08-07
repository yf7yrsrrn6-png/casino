import { useMemo } from 'react'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import type { Trade } from '@/lib/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { Stat } from '@/components/ui/Stat'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { PnL } from '@/components/ui/Badge'
import { IconTrend } from '@/components/ui/icons'
import { money, pct, num } from '@/lib/format'

interface Group {
  key: string
  count: number
  wins: number
  net: number
  rSum: number
  rCount: number
}

const WEEKDAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота']

function net(t: Trade) {
  return (t.pnl ?? 0) - (t.fees ?? 0)
}

function groupBy(trades: Trade[], keyFn: (t: Trade) => string | null): Group[] {
  const map = new Map<string, Group>()
  for (const t of trades) {
    const k = keyFn(t)
    if (!k) continue
    const g = map.get(k) ?? { key: k, count: 0, wins: 0, net: 0, rSum: 0, rCount: 0 }
    g.count++
    if (net(t) > 0) g.wins++
    g.net += net(t)
    if (t.rr != null) {
      g.rSum += t.rr
      g.rCount++
    }
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => b.net - a.net)
}

function Breakdown({
  title,
  groups,
  currency,
}: {
  title: string
  groups: Group[]
  currency: string
}) {
  const maxAbs = Math.max(1, ...groups.map((g) => Math.abs(g.net)))
  return (
    <Card>
      <CardHeader title={title} subtitle={`${groups.length} категорій`} />
      <div className="divide-y divide-border">
        {groups.length === 0 ? (
          <p className="px-5 py-6 text-center text-[13px] text-subtle">Немає даних</p>
        ) : (
          groups.map((g) => {
            const winRate = g.count ? (g.wins / g.count) * 100 : 0
            const avgR = g.rCount ? g.rSum / g.rCount : null
            const barW = (Math.abs(g.net) / maxAbs) * 100
            const positive = g.net >= 0
            return (
              <div key={g.key} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[14px] font-semibold text-text">{g.key}</span>
                  <PnL value={g.net} currency={currency} className="text-[14px]" />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${positive ? 'bg-profit' : 'bg-loss'}`}
                    style={{ width: `${barW}%`, opacity: positive ? 0.9 : 0.5 }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[12px] text-subtle">
                  <span>{g.count} угод</span>
                  <span>·</span>
                  <span>вінрейт {pct(winRate)}</span>
                  {avgR != null && (
                    <>
                      <span>·</span>
                      <span>сер. {avgR > 0 ? '+' : ''}{avgR.toFixed(2)}R</span>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

export function Analytics() {
  const trades = useTrades((s) => s.trades)
  const stats = useTrades((s) => s.stats)
  const loaded = useTrades((s) => s.loaded)
  const currency = useSettings((s) => s.settings.currency)

  const closed = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])

  const bySetup = useMemo(() => groupBy(closed, (t) => t.setup), [closed])
  const bySymbol = useMemo(() => groupBy(closed, (t) => t.symbol), [closed])
  const bySession = useMemo(() => groupBy(closed, (t) => t.session), [closed])
  const byWeekday = useMemo(
    () => groupBy(closed, (t) => (t.closedAt ? WEEKDAYS[new Date(t.closedAt).getDay()] : null)),
    [closed],
  )
  const byDirection = useMemo(
    () => groupBy(closed, (t) => (t.direction === 'long' ? 'Long' : 'Short')),
    [closed],
  )

  // R-multiple distribution.
  const rDist = useMemo(() => {
    const buckets = [
      { label: '≤−2R', lo: -Infinity, hi: -2, win: false },
      { label: '−2…−1', lo: -2, hi: -1, win: false },
      { label: '−1…0', lo: -1, hi: 0, win: false },
      { label: '0…1', lo: 0, hi: 1, win: true },
      { label: '1…2', lo: 1, hi: 2, win: true },
      { label: '2…3', lo: 2, hi: 3, win: true },
      { label: '≥3R', lo: 3, hi: Infinity, win: true },
    ].map((b) => ({ ...b, count: 0 }))
    for (const t of closed) {
      if (t.rr == null) continue
      const b = buckets.find((x) => t.rr! >= x.lo && t.rr! < x.hi) ?? buckets[buckets.length - 1]
      b.count++
    }
    return buckets
  }, [closed])

  // Performance by hour of day (close time).
  const byHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ h, net: 0, count: 0 }))
    for (const t of closed) {
      if (!t.closedAt) continue
      const h = new Date(t.closedAt).getHours()
      hours[h].net += net(t)
      hours[h].count++
    }
    return hours
  }, [closed])

  if (!loaded) return <PageLoader />
  if (closed.length === 0)
    return (
      <EmptyState
        icon={<IconTrend width={24} height={24} />}
        title="Ще немає закритих угод"
        description="Аналітика з’явиться, щойно ви закриєте перші позиції."
      />
    )

  const grossProfit = stats?.grossProfit ?? 0
  const grossLoss = stats?.grossLoss ?? 0

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Чистий P&L"
          value={money(stats?.netPnl, currency, true)}
          tone={(stats?.netPnl ?? 0) >= 0 ? 'profit' : 'loss'}
          sub={`${closed.length} угод`}
        />
        <Stat label="Вінрейт" value={pct(stats?.winRate)} sub={`${stats?.wins}П / ${stats?.losses}З`} />
        <Stat
          label="Profit Factor"
          value={stats?.profitFactor != null ? stats.profitFactor.toFixed(2) : '∞'}
          sub={`сер. R ${stats?.avgRr ?? '—'}`}
        />
        <Stat
          label="Очікування"
          value={money(stats?.expectancy, currency, true)}
          tone={(stats?.expectancy ?? 0) >= 0 ? 'profit' : 'loss'}
          sub={`макс ${num(stats?.bestTrade)} / ${num(stats?.worstTrade)}`}
        />
      </div>

      {/* Gross profit vs loss bar */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-text">Валовий профіт проти збитку</span>
          <span className="text-subtle">
            <span className="text-profit">{money(grossProfit, currency)}</span> ·{' '}
            <span className="text-loss">−{money(grossLoss, currency)}</span>
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-profit"
            style={{ width: `${(grossProfit / (grossProfit + grossLoss || 1)) * 100}%` }}
          />
          <div
            className="h-full bg-loss opacity-60"
            style={{ width: `${(grossLoss / (grossProfit + grossLoss || 1)) * 100}%` }}
          />
        </div>
      </Card>

      {/* Distribution + time-of-day */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Розподіл R-мультиплікаторів" subtitle="Скільки угод у кожному діапазоні R" />
          <div className="flex h-52 items-end gap-2 px-5 py-4">
            {(() => {
              const maxC = Math.max(1, ...rDist.map((b) => b.count))
              return rDist.map((b) => (
                <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="tnum text-[11px] font-semibold text-muted">{b.count || ''}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-md ${b.win ? 'bg-profit' : 'bg-loss'}`}
                      style={{ height: `${(b.count / maxC) * 100}%`, opacity: b.win ? 0.9 : 0.55, minHeight: b.count ? 4 : 0 }}
                    />
                  </div>
                  <span className="text-[10px] text-subtle">{b.label}</span>
                </div>
              ))
            })()}
          </div>
        </Card>

        <Card>
          <CardHeader title="Результат за годиною доби" subtitle="Сумарний P&L за часом закриття" />
          <div className="flex h-52 items-center gap-[3px] px-5 py-4">
            {(() => {
              const maxAbs = Math.max(1, ...byHour.map((h) => Math.abs(h.net)))
              return byHour.map((h) => {
                const pos = h.net >= 0
                const heightPct = (Math.abs(h.net) / maxAbs) * 45
                return (
                  <div key={h.h} className="group relative flex flex-1 flex-col items-center justify-center" title={`${h.h}:00 · ${money(h.net, currency, true)} · ${h.count} угод`}>
                    <div className="flex h-[45%] w-full items-end">
                      {pos && (
                        <div className="w-full rounded-t bg-profit" style={{ height: `${heightPct * 2}%`, opacity: 0.9, minHeight: h.count ? 3 : 0 }} />
                      )}
                    </div>
                    <div className="h-px w-full bg-border" />
                    <div className="flex h-[45%] w-full items-start">
                      {!pos && (
                        <div className="w-full rounded-b bg-loss" style={{ height: `${heightPct * 2}%`, opacity: 0.55, minHeight: h.count ? 3 : 0 }} />
                      )}
                    </div>
                    {h.h % 6 === 0 && (
                      <span className="absolute -bottom-4 text-[9px] text-subtle">{h.h}</span>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="За сетапом" groups={bySetup} currency={currency} />
        <Breakdown title="За інструментом" groups={bySymbol} currency={currency} />
        <Breakdown title="За сесією" groups={bySession} currency={currency} />
        <Breakdown title="За днем тижня" groups={byWeekday} currency={currency} />
        <Breakdown title="За напрямом" groups={byDirection} currency={currency} />
      </div>
    </div>
  )
}
