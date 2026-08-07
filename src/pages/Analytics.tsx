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
