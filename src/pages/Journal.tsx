import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import type { Trade, TradeStatus } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { PnL } from '@/components/ui/Badge'
import { EmptyState, PageLoader, ConfirmDialog } from '@/components/ui/Feedback'
import {
  IconSearch,
  IconJournal,
  IconPlus,
  IconTable,
  IconBoard,
  IconGallery,
  IconCalendar,
  IconDownload,
} from '@/components/ui/icons'
import { downloadCsv } from '@/lib/csv'
import { TableView } from '@/components/journal/TableView'
import { BoardView } from '@/components/journal/BoardView'
import { GalleryView } from '@/components/journal/GalleryView'
import { CalendarView } from '@/components/journal/CalendarView'

type Filter = 'all' | TradeStatus
type ViewKey = 'table' | 'board' | 'gallery' | 'calendar'

const VIEWS: { key: ViewKey; label: string; icon: typeof IconTable }[] = [
  { key: 'table', label: 'Таблиця', icon: IconTable },
  { key: 'board', label: 'Дошка', icon: IconBoard },
  { key: 'gallery', label: 'Галерея', icon: IconGallery },
  { key: 'calendar', label: 'Календар', icon: IconCalendar },
]

export function Journal() {
  const trades = useTrades((s) => s.trades)
  const loaded = useTrades((s) => s.loaded)
  const openEditor = useTrades((s) => s.openEditor)
  const remove = useTrades((s) => s.remove)
  const currency = useSettings((s) => s.settings.currency)
  const navigate = useNavigate()

  const [view, setView] = useState<ViewKey>(
    () => (localStorage.getItem('tj_journal_view') as ViewKey) || 'table',
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [toDelete, setToDelete] = useState<Trade | null>(null)

  function selectView(v: ViewKey) {
    setView(v)
    localStorage.setItem('tj_journal_view', v)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return trades.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false
      if (q && !t.symbol.includes(q) && !(t.setup ?? '').toUpperCase().includes(q)) return false
      return true
    })
  }, [trades, filter, query])

  const summary = useMemo(() => {
    const closed = filtered.filter((t) => t.status === 'closed')
    const net = closed.reduce((s, t) => s + (t.pnl ?? 0) - (t.fees ?? 0), 0)
    return { count: filtered.length, open: filtered.filter((t) => t.status === 'open').length, net }
  }, [filtered])

  if (!loaded) return <PageLoader />

  const counts = {
    all: trades.length,
    open: trades.filter((t) => t.status === 'open').length,
    closed: trades.filter((t) => t.status === 'closed').length,
  }
  const open = (id: string) => navigate(`/journal/${id}`)
  const showFilters = view !== 'calendar'

  return (
    <div className="space-y-5">
      {/* View switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => selectView(key)}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                view === key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
              }`}
            >
              <Icon width={15} height={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {showFilters && (
            <div className="relative sm:w-64">
              <IconSearch
                width={16}
                height={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук за інструментом / сетапом"
                className="pl-9"
              />
            </div>
          )}
          {trades.length > 0 && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => downloadCsv(trades)}
              title="Експорт у CSV"
            >
              <IconDownload width={16} height={16} />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* Status filter pills */}
      {showFilters && (
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`focus-ring rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === f ? 'bg-accent-soft text-text' : 'text-muted hover:text-text'
              }`}
            >
              {f === 'all' ? 'Усі' : f === 'open' ? 'Відкриті' : 'Закриті'}
              <span className="ml-1.5 text-subtle">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {trades.length === 0 ? (
        <EmptyState
          icon={<IconJournal width={24} height={24} />}
          title="Журнал порожній"
          description="Додайте свою першу позицію, щоб почати вести статистику."
          action={
            <Button onClick={() => openEditor()}>
              <IconPlus width={17} height={17} /> Нова позиція
            </Button>
          }
        />
      ) : view === 'calendar' ? (
        <CalendarView trades={trades} currency={currency} onOpen={open} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconSearch width={24} height={24} />}
          title="Нічого не знайдено"
          description="Спробуйте змінити фільтр або пошуковий запит."
        />
      ) : (
        <>
          {view === 'table' && (
            <TableView
              trades={filtered}
              currency={currency}
              onOpen={open}
              onEdit={(t) => openEditor(t)}
              onDelete={setToDelete}
            />
          )}
          {view === 'board' && <BoardView trades={filtered} currency={currency} onOpen={open} />}
          {view === 'gallery' && <GalleryView trades={filtered} currency={currency} onOpen={open} />}

          <div className="flex items-center justify-between px-1 text-[13px] text-muted">
            <span>
              {summary.count} позицій · {summary.open} відкритих
            </span>
            <span>
              Разом закритих: <PnL value={summary.net} currency={currency} />
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Видалити позицію?"
        message={`${toDelete?.symbol} буде видалено назавжди разом із прикріпленими графіками.`}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove(toDelete.id)
          setToDelete(null)
        }}
      />
    </div>
  )
}
