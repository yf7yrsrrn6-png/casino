import { useMemo } from 'react'
import type { Trade } from '@/lib/api'
import { DirectionBadge, PnL, RValue } from '@/components/ui/Badge'
import { price } from '@/lib/format'

type ColumnKey = 'open' | 'win' | 'loss' | 'be'

const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: 'open', title: 'Відкриті' },
  { key: 'win', title: 'Прибуткові' },
  { key: 'loss', title: 'Збиткові' },
  { key: 'be', title: 'Беззбиток' },
]

function bucket(t: Trade): ColumnKey {
  if (t.status === 'open') return 'open'
  const net = (t.pnl ?? 0) - (t.fees ?? 0)
  if (net > 0) return 'win'
  if (net < 0) return 'loss'
  return 'be'
}

export function BoardView({
  trades,
  currency,
  onOpen,
}: {
  trades: Trade[]
  currency: string
  onOpen: (id: string) => void
}) {
  const groups = useMemo(() => {
    const g: Record<ColumnKey, Trade[]> = { open: [], win: [], loss: [], be: [] }
    for (const t of trades) g[bucket(t)].push(t)
    return g
  }, [trades])

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = groups[col.key]
        const sum = items.reduce((s, t) => s + ((t.pnl ?? 0) - (t.fees ?? 0)), 0)
        return (
          <div key={col.key} className="flex flex-col">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">{col.title}</span>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-muted">
                  {items.length}
                </span>
              </div>
              {col.key !== 'open' && items.length > 0 && (
                <PnL value={sum} currency={currency} className="text-[12px]" />
              )}
            </div>
            <div className="flex-1 space-y-2 rounded-2xl border border-border bg-surface/40 p-2">
              {items.length === 0 ? (
                <div className="grid place-items-center py-8 text-[12px] text-subtle">Порожньо</div>
              ) : (
                items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t.id)}
                    className="surface-card w-full rounded-xl p-3 text-left transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold tracking-tight text-text">{t.symbol}</span>
                        <DirectionBadge direction={t.direction} />
                      </div>
                      {t.status === 'closed' ? (
                        <RValue value={t.rr} />
                      ) : (
                        <span className="tnum text-[12px] text-subtle">{price(t.entryPrice)}</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="truncate text-[12px] text-subtle">{t.setup ?? '—'}</span>
                      {t.status === 'closed' && (
                        <PnL value={(t.pnl ?? 0) - (t.fees ?? 0)} currency={currency} className="text-[13px]" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
