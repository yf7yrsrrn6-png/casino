import type { Trade } from '@/lib/api'
import { DirectionBadge, StatusBadge, PnL, RValue, Tag } from '@/components/ui/Badge'
import { IconImage } from '@/components/ui/icons'
import { formatDate, price } from '@/lib/format'

export function GalleryView({
  trades,
  currency,
  onOpen,
}: {
  trades: Trade[]
  currency: string
  onOpen: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {trades.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="surface-card group overflow-hidden rounded-2xl text-left transition-all hover:border-border-strong hover:shadow-lg"
        >
          <div className="relative aspect-video overflow-hidden bg-surface-2">
            {t.coverUrl ? (
              <img
                src={t.coverUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="grid h-full place-items-center text-subtle">
                <IconImage width={26} height={26} />
              </div>
            )}
            <div className="absolute left-2 top-2">
              <StatusBadge status={t.status} />
            </div>
          </div>
          <div className="p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-text">{t.symbol}</span>
                <DirectionBadge direction={t.direction} />
              </div>
              {t.status === 'closed' && (
                <PnL value={(t.pnl ?? 0) - (t.fees ?? 0)} currency={currency} className="text-[15px]" />
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[12px] text-subtle">
              <span>{[t.setup, t.timeframe].filter(Boolean).join(' · ') || formatDate(t.openedAt)}</span>
              {t.status === 'closed' ? (
                <RValue value={t.rr} />
              ) : (
                <span className="tnum">вхід {price(t.entryPrice)}</span>
              )}
            </div>
            {t.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {t.tags.slice(0, 3).map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
