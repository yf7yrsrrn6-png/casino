import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Goal } from '@/lib/api'
import { computeGoalProgress, METRIC_LABEL } from '@/lib/goals'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import { useSession } from '@/store/useSession'
import { Card, CardHeader } from '@/components/ui/Card'
import { Stat } from '@/components/ui/Stat'
import { Button } from '@/components/ui/Button'
import { DirectionBadge, StatusBadge, PnL, RValue } from '@/components/ui/Badge'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { EquityChart } from '@/components/dashboard/EquityChart'
import { IconPlus, IconTrend, IconTarget, IconScale, IconJournal } from '@/components/ui/icons'
import { money, pct, num, price, formatDate, formatDuration } from '@/lib/format'

export function Dashboard() {
  const trades = useTrades((s) => s.trades)
  const stats = useTrades((s) => s.stats)
  const loaded = useTrades((s) => s.loaded)
  const openEditor = useTrades((s) => s.openEditor)
  const settings = useSettings((s) => s.settings)
  const user = useSession((s) => s.user)

  const [goals, setGoals] = useState<Goal[]>([])
  useEffect(() => {
    api
      .get<{ goals: Goal[] }>('/goals')
      .then(({ goals }) => setGoals(goals))
      .catch(() => {})
  }, [])

  const openPositions = useMemo(() => trades.filter((t) => t.status === 'open'), [trades])
  const recent = useMemo(
    () => trades.filter((t) => t.status === 'closed').slice(0, 6),
    [trades],
  )

  if (!loaded) return <PageLoader />

  const currency = settings.currency
  const hasTrades = trades.length > 0
  const equityNow = settings.accountBalance + (stats?.netPnl ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">
            Вітаю, {user?.displayName}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Поточний капітал:{' '}
            <span className="tnum font-semibold text-text">{money(equityNow, currency)}</span>
          </p>
        </div>
        <Button onClick={() => openEditor()}>
          <IconPlus width={17} height={17} /> Нова позиція
        </Button>
      </div>

      {!hasTrades ? (
        <EmptyState
          icon={<IconJournal width={24} height={24} />}
          title="Почнімо вести журнал"
          description="Додайте першу позицію — і тут з’являться ваша статистика, крива капіталу та історія угод."
          action={
            <Button onClick={() => openEditor()}>
              <IconPlus width={17} height={17} /> Додати позицію
            </Button>
          }
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Чистий P&L"
              value={money(stats?.netPnl, currency, true)}
              tone={(stats?.netPnl ?? 0) >= 0 ? 'profit' : 'loss'}
              sub={`${stats?.closedTrades ?? 0} закритих угод`}
              icon={<IconTrend width={18} height={18} />}
            />
            <Stat
              label="Вінрейт"
              value={pct(stats?.winRate)}
              sub={`${stats?.wins ?? 0}П / ${stats?.losses ?? 0}З`}
              tone="accent"
              icon={<IconTarget width={18} height={18} />}
            />
            <Stat
              label="Profit Factor"
              value={stats?.profitFactor != null ? stats.profitFactor.toFixed(2) : '∞'}
              sub={`сер. R ${stats?.avgRr ?? '—'}`}
              icon={<IconScale width={18} height={18} />}
            />
            <Stat
              label="Очікування / угоду"
              value={money(stats?.expectancy, currency, true)}
              tone={(stats?.expectancy ?? 0) >= 0 ? 'profit' : 'loss'}
              sub={`${openPositions.length} відкритих`}
            />
          </div>

          {/* Equity + side panel */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Крива капіталу"
                subtitle={`Старт: ${money(settings.accountBalance, currency)}`}
                action={
                  <div className="text-right">
                    <PnL value={stats?.netPnl} currency={currency} className="text-lg" />
                  </div>
                }
              />
              <div className="p-4">
                <EquityChart
                  data={(stats?.equityCurve ?? []).map((p) => ({ t: p.t, equity: p.equity }))}
                  currency={currency}
                />
              </div>
            </Card>

            {/* Best/worst + streak */}
            <div className="space-y-3">
              <Card className="p-4">
                <div className="text-[13px] font-medium text-muted">Найкраща угода</div>
                <PnL value={stats?.bestTrade} currency={currency} className="mt-1 block text-xl" />
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-medium text-muted">Найгірша угода</div>
                <PnL value={stats?.worstTrade} currency={currency} className="mt-1 block text-xl" />
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-medium text-muted">Поточна серія</div>
                <div
                  className={`tnum mt-1 text-xl font-bold ${
                    (stats?.currentStreak ?? 0) > 0
                      ? 'text-profit'
                      : (stats?.currentStreak ?? 0) < 0
                        ? 'text-loss'
                        : 'text-text'
                  }`}
                >
                  {(stats?.currentStreak ?? 0) === 0
                    ? '—'
                    : `${Math.abs(stats!.currentStreak)} ${stats!.currentStreak > 0 ? 'перемог' : 'поспіль ↓'}`}
                </div>
              </Card>
            </div>
          </div>

          {/* Advanced metrics strip */}
          <Card>
            <CardHeader title="Розширені метрики" subtitle="Показники якості системи" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-border sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: 'Макс. просадка',
                  value: money(stats?.maxDrawdown, currency),
                  sub: pct(stats?.maxDrawdownPct),
                  tone: 'loss' as const,
                },
                {
                  label: 'Expectancy',
                  value: stats?.expectancyR != null ? `${stats.expectancyR > 0 ? '+' : ''}${stats.expectancyR}R` : '—',
                  sub: 'на угоду',
                  tone: (stats?.expectancyR ?? 0) >= 0 ? ('profit' as const) : ('loss' as const),
                },
                {
                  label: 'SQN',
                  value: stats?.sqn != null ? stats.sqn.toFixed(2) : '—',
                  sub: 'якість системи',
                  tone: 'default' as const,
                },
                {
                  label: 'Сер. час у ринку',
                  value: formatDuration(stats?.avgHoldMinutes),
                  sub: 'на угоду',
                  tone: 'default' as const,
                },
                {
                  label: 'Серії',
                  value: `${stats?.maxWinStreak ?? 0} / ${stats?.maxLossStreak ?? 0}`,
                  sub: 'макс П / З',
                  tone: 'default' as const,
                },
                {
                  label: 'Дисципліна',
                  value: stats?.avgDiscipline != null ? `${stats.avgDiscipline}%` : '—',
                  sub: 'чеклист',
                  tone: 'default' as const,
                },
              ].map((m) => (
                <div key={m.label} className="bg-surface p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                    {m.label}
                  </div>
                  <div
                    className={`tnum mt-1.5 text-lg font-bold ${
                      m.tone === 'profit' ? 'text-profit' : m.tone === 'loss' ? 'text-loss' : 'text-text'
                    }`}
                  >
                    {m.value}
                  </div>
                  <div className="text-[11px] text-subtle">{m.sub}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Goals progress */}
          {goals.length > 0 && (
            <Card>
              <CardHeader
                title="Цілі"
                subtitle="Прогрес за поточний період"
                action={
                  <Link to="/goals" className="text-[13px] font-semibold text-accent hover:underline">
                    Усі
                  </Link>
                }
              />
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl bg-border sm:grid-cols-2 lg:grid-cols-3">
                {goals.slice(0, 3).map((g) => {
                  const p = computeGoalProgress(g, trades, currency)
                  return (
                    <div key={g.id} className="bg-surface p-4">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[13px] font-semibold text-text">{g.title}</span>
                        <span className="tnum text-[12px] text-subtle">{p.pct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 text-[11px] text-subtle">{METRIC_LABEL[g.metric]}</div>
                      <div className="mt-2 flex items-end justify-between">
                        <span className="tnum text-[17px] font-bold text-text">{p.display}</span>
                        <span className="tnum text-[12px] text-subtle">/ {p.targetDisplay}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${p.reached ? 'bg-profit' : 'bg-white'}`}
                          style={{ width: `${p.pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Open positions + recent */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Відкриті позиції"
                subtitle={`${openPositions.length} активних`}
                action={
                  <Link to="/journal" className="text-[13px] font-semibold text-accent hover:underline">
                    Усі
                  </Link>
                }
              />
              <div className="divide-y divide-border">
                {openPositions.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-subtle">Немає відкритих позицій</p>
                ) : (
                  openPositions.slice(0, 6).map((t) => (
                    <Link
                      key={t.id}
                      to={`/journal/${t.id}`}
                      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-2/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text">{t.symbol}</span>
                        <DirectionBadge direction={t.direction} />
                      </div>
                      <div className="tnum text-[13px] text-muted">
                        вхід {price(t.entryPrice)} · {num(t.size)}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Останні закриті"
                action={
                  <Link to="/journal" className="text-[13px] font-semibold text-accent hover:underline">
                    Усі
                  </Link>
                }
              />
              <div className="divide-y divide-border">
                {recent.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-subtle">Ще немає закритих угод</p>
                ) : (
                  recent.map((t) => (
                    <Link
                      key={t.id}
                      to={`/journal/${t.id}`}
                      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-2/60"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">{t.symbol}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <div className="mt-0.5 text-[12px] text-subtle">{formatDate(t.closedAt)}</div>
                      </div>
                      <div className="text-right">
                        <PnL value={(t.pnl ?? 0) - (t.fees ?? 0)} currency={currency} />
                        <div className="tnum text-[12px] text-subtle">
                          <RValue value={t.rr} />
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
