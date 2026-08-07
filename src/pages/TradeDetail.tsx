import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, type Trade, type TradeImage, type Plan } from '@/lib/api'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DirectionBadge, StatusBadge, PnL, RValue } from '@/components/ui/Badge'
import { PageLoader, EmptyState, ConfirmDialog } from '@/components/ui/Feedback'
import { ImageUploader } from '@/components/media/ImageUploader'
import {
  IconEdit,
  IconTrash,
  IconChevronRight,
  IconStar,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
} from '@/components/ui/icons'
import { price, num, money, formatDateTime } from '@/lib/format'

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="tnum text-[14px] font-semibold text-text">{value}</span>
    </div>
  )
}

export function TradeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currency = useSettings((s) => s.settings.currency)
  const openEditor = useTrades((s) => s.openEditor)
  const remove = useTrades((s) => s.remove)
  const storeTrades = useTrades((s) => s.trades)

  const [trade, setTrade] = useState<Trade | null>(null)
  const [images, setImages] = useState<TradeImage[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [playbook, setPlaybook] = useState<Plan | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<{ trade: Trade; images: TradeImage[] }>(`/trades/${id}`)
      .then(({ trade, images }) => {
        setTrade(trade)
        setImages(images)
      })
      .catch(() => setMissing(true))
      .finally(() => setLoading(false))
  }, [id])

  // Reflect edits made through the global editor.
  useEffect(() => {
    if (!id) return
    const fresh = storeTrades.find((t) => t.id === id)
    if (fresh) setTrade(fresh)
  }, [storeTrades, id])

  // Link a matching playbook by setup name.
  useEffect(() => {
    const setup = trade?.setup?.trim().toLowerCase()
    if (!setup) {
      setPlaybook(null)
      return
    }
    api
      .get<{ plans: Plan[] }>('/plans')
      .then(({ plans }) => {
        const match = plans.find(
          (p) => p.kind === 'playbook' && p.title.trim().toLowerCase() === setup,
        )
        setPlaybook(match ?? null)
      })
      .catch(() => setPlaybook(null))
  }, [trade?.setup])

  if (loading) return <PageLoader />
  if (missing || !trade)
    return (
      <EmptyState
        title="Позицію не знайдено"
        description="Можливо, її було видалено."
        action={<Button onClick={() => navigate('/journal')}>До журналу</Button>}
      />
    )

  const netPnl = (trade.pnl ?? 0) - (trade.fees ?? 0)
  const closed = trade.status === 'closed'

  // How much of the favourable excursion the exit captured.
  let captured: number | null = null
  if (closed && trade.entryPrice != null && trade.exitPrice != null && trade.mfe != null) {
    const favMove =
      trade.direction === 'long' ? trade.mfe - trade.entryPrice : trade.entryPrice - trade.mfe
    const realized =
      trade.direction === 'long'
        ? trade.exitPrice - trade.entryPrice
        : trade.entryPrice - trade.exitPrice
    if (favMove > 0) captured = Math.max(0, Math.min(100, (realized / favMove) * 100))
  }

  const checklistDone = trade.checklist.filter((c) => c.done).length
  const discipline = trade.checklist.length
    ? Math.round((checklistDone / trade.checklist.length) * 100)
    : null

  // Prev/next within the journal order.
  const idx = storeTrades.findIndex((t) => t.id === id)
  const prevId = idx > 0 ? storeTrades[idx - 1].id : null
  const nextId = idx >= 0 && idx < storeTrades.length - 1 ? storeTrades[idx + 1].id : null

  return (
    <div className="space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <Link to="/journal" className="hover:text-text">
            Журнал
          </Link>
          <IconChevronRight width={14} height={14} className="text-subtle" />
          <span className="font-medium text-text">{trade.symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-1 flex items-center gap-1">
            <button
              onClick={() => prevId && navigate(`/journal/${prevId}`)}
              disabled={!prevId}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text disabled:opacity-40"
              title="Попередня"
            >
              <IconArrowLeft width={15} height={15} />
            </button>
            <button
              onClick={() => nextId && navigate(`/journal/${nextId}`)}
              disabled={!nextId}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-text disabled:opacity-40"
              title="Наступна"
            >
              <IconArrowRight width={15} height={15} />
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openEditor(trade)}>
            <IconEdit width={15} height={15} /> Редагувати
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            <IconTrash width={15} height={15} />
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-text">{trade.symbol}</h2>
            <DirectionBadge direction={trade.direction} />
            <StatusBadge status={trade.status} />
          </div>
          {closed && (
            <div className="text-right">
              <PnL value={netPnl} currency={currency} className="text-2xl" />
              <div className="tnum mt-0.5 text-[13px] text-muted">
                <RValue value={trade.rr} />
              </div>
            </div>
          )}
        </div>
        {trade.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {trade.tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Numbers */}
        <Card className="p-5 lg:col-span-1">
          <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-subtle">
            Параметри угоди
          </h3>
          <div className="divide-y divide-border">
            <Detail label="Вхід" value={price(trade.entryPrice)} />
            <Detail label="Stop Loss" value={price(trade.stopLoss)} />
            <Detail label="Take Profit" value={price(trade.takeProfit)} />
            {closed && <Detail label="Вихід" value={price(trade.exitPrice)} />}
            <Detail label="Обсяг" value={num(trade.size)} />
            <Detail label="Ризик" value={money(trade.riskAmount, currency)} />
            <Detail label="Комісія" value={money(trade.fees, currency)} />
            {closed && trade.mae != null && <Detail label="MAE" value={price(trade.mae)} />}
            {closed && trade.mfe != null && <Detail label="MFE" value={price(trade.mfe)} />}
            {captured != null && <Detail label="Захоплено ходу" value={`${captured.toFixed(0)}%`} />}
            {closed && <Detail label="Чистий P&L" value={<PnL value={netPnl} currency={currency} />} />}
          </div>
        </Card>

        {/* Context */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">
            Контекст
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[12px] text-subtle">Сетап</div>
              {playbook ? (
                <Link
                  to={`/plans/${playbook.id}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-[14px] font-medium text-accent hover:underline"
                >
                  {trade.setup}
                  <IconChevronRight width={13} height={13} />
                </Link>
              ) : (
                <div className="mt-0.5 text-[14px] font-medium text-text">{trade.setup ?? '—'}</div>
              )}
            </div>
            <div>
              <div className="text-[12px] text-subtle">Сесія</div>
              <div className="mt-0.5 text-[14px] font-medium text-text">{trade.session ?? '—'}</div>
            </div>
            <div>
              <div className="text-[12px] text-subtle">Таймфрейм</div>
              <div className="mt-0.5 text-[14px] font-medium text-text">{trade.timeframe ?? '—'}</div>
            </div>
            <div>
              <div className="text-[12px] text-subtle">Емоція / стан</div>
              <div className="mt-0.5 text-[14px] font-medium text-text">{trade.emotion ?? '—'}</div>
            </div>
            <div>
              <div className="text-[12px] text-subtle">Впевненість</div>
              <div className="mt-0.5 text-[14px] font-medium text-text">
                {trade.confidence != null ? `${trade.confidence}/5` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-subtle">Відкрито</div>
              <div className="mt-0.5 text-[13px] font-medium text-text">
                {formatDateTime(trade.openedAt)}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-subtle">Закрито</div>
              <div className="mt-0.5 text-[13px] font-medium text-text">
                {closed ? formatDateTime(trade.closedAt) : '—'}
              </div>
            </div>
          </div>

          {closed && trade.rating != null && (
            <div className="mt-4 flex items-center gap-1">
              <span className="mr-1 text-[12px] text-subtle">Оцінка:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <IconStar
                  key={n}
                  width={16}
                  height={16}
                  className={n <= trade.rating! ? 'fill-warn text-warn' : 'fill-transparent text-border-strong'}
                />
              ))}
            </div>
          )}

          {trade.plan && (
            <div className="mt-5">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">
                План
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{trade.plan}</p>
            </div>
          )}
          {trade.notes && (
            <div className="mt-4">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">
                Розбір
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{trade.notes}</p>
            </div>
          )}
          {trade.mistakes && (
            <div className="mt-4 rounded-xl border border-loss/25 bg-loss-soft px-3.5 py-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-loss">
                Помилки
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">
                {trade.mistakes}
              </p>
            </div>
          )}

          {trade.checklist.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-subtle">
                  Пре-трейд чеклист
                </span>
                {discipline != null && (
                  <span className="tnum text-[12px] font-semibold text-muted">
                    Дисципліна {discipline}% · {checklistDone}/{trade.checklist.length}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {trade.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[14px]">
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        item.done
                          ? 'border-white bg-white text-[#0a0b0d]'
                          : 'border-border-strong text-transparent'
                      }`}
                    >
                      <IconCheck width={11} height={11} />
                    </span>
                    <span className={item.done ? 'text-text' : 'text-subtle'}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Charts */}
      <Card className="p-5">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-subtle">
          Графіки та аналіз
        </h3>
        <ImageUploader tradeId={trade.id} images={images} onChange={setImages} />
      </Card>

      <ConfirmDialog
        open={confirm}
        title="Видалити позицію?"
        message={`${trade.symbol} буде видалено назавжди.`}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          void remove(trade.id)
          navigate('/journal')
        }}
      />
    </div>
  )
}
