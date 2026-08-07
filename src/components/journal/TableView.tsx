import type { Trade } from '@/lib/api'
import { DirectionBadge, StatusBadge, PnL, RValue } from '@/components/ui/Badge'
import { IconEdit, IconTrash, IconImage } from '@/components/ui/icons'
import { formatDate, price, num, money } from '@/lib/format'

export function TableView({
  trades,
  currency,
  onOpen,
  onEdit,
  onDelete,
}: {
  trades: Trade[]
  currency: string
  onOpen: (id: string) => void
  onEdit: (t: Trade) => void
  onDelete: (t: Trade) => void
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="surface-card hidden overflow-hidden rounded-2xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
                <th className="px-4 py-3">Інструмент</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Вхід</th>
                <th className="px-4 py-3 text-right">Обсяг</th>
                <th className="px-4 py-3 text-right">Ризик</th>
                <th className="px-4 py-3 text-right">R</th>
                <th className="px-4 py-3 text-right">P&L</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className="group cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-subtle">
                        {t.coverUrl ? (
                          <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <IconImage width={15} height={15} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold tracking-tight text-text">{t.symbol}</span>
                          <DirectionBadge direction={t.direction} />
                        </div>
                        <div className="mt-0.5 text-[12px] text-subtle">
                          {[t.setup, t.timeframe].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="tnum px-4 py-3 text-right text-muted">{price(t.entryPrice)}</td>
                  <td className="tnum px-4 py-3 text-right text-muted">{num(t.size)}</td>
                  <td className="tnum px-4 py-3 text-right text-muted">{money(t.riskAmount, currency)}</td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'closed' ? <RValue value={t.rr} /> : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'closed' ? (
                      <PnL value={(t.pnl ?? 0) - (t.fees ?? 0)} currency={currency} />
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted">{formatDate(t.openedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(t)
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-text"
                        aria-label="Редагувати"
                      >
                        <IconEdit width={16} height={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(t)
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-loss-soft hover:text-loss"
                        aria-label="Видалити"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {trades.map((t) => (
          <div
            key={t.id}
            onClick={() => onOpen(t.id)}
            className="surface-card cursor-pointer rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-text">{t.symbol}</span>
                <DirectionBadge direction={t.direction} />
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-[12px] text-subtle">
                {t.setup && <div>{t.setup}</div>}
                <div>{formatDate(t.openedAt)}</div>
              </div>
              {t.status === 'closed' ? (
                <div className="text-right">
                  <PnL value={(t.pnl ?? 0) - (t.fees ?? 0)} currency={currency} className="text-base" />
                  <div className="tnum text-[12px] text-subtle">
                    <RValue value={t.rr} />
                  </div>
                </div>
              ) : (
                <span className="tnum text-[13px] text-muted">вхід {price(t.entryPrice)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
