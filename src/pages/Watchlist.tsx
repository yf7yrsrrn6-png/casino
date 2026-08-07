import { useEffect, useState } from 'react'
import { api, type WatchItem, type Bias } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, PageLoader, ConfirmDialog } from '@/components/ui/Feedback'
import { NumberInput } from '@/components/trades/parts'
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconPin,
  IconExternal,
  IconTarget,
} from '@/components/ui/icons'
import { price } from '@/lib/format'

const BIAS_LABEL: Record<Bias, string> = { long: 'Long', short: 'Short', neutral: 'Neutral' }

function BiasBadge({ bias }: { bias: Bias }) {
  const cls =
    bias === 'long'
      ? 'bg-profit-soft text-profit'
      : bias === 'short'
        ? 'bg-loss-soft text-loss'
        : 'bg-surface-2 text-muted'
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {BIAS_LABEL[bias]}
    </span>
  )
}

interface FormState {
  symbol: string
  bias: Bias
  entry: number | null
  target: number | null
  stop: number | null
  note: string
}

const EMPTY: FormState = { symbol: '', bias: 'neutral', entry: null, target: null, stop: null, note: '' }

export function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [toDelete, setToDelete] = useState<WatchItem | null>(null)

  useEffect(() => {
    api
      .get<{ items: WatchItem[] }>('/watchlist')
      .then(({ items }) => setItems(items))
      .finally(() => setLoaded(true))
  }, [])

  function openNew() {
    setEditingId(null)
    setForm(EMPTY)
    setEditorOpen(true)
  }
  function openEdit(w: WatchItem) {
    setEditingId(w.id)
    setForm({
      symbol: w.symbol,
      bias: w.bias,
      entry: w.entry,
      target: w.target,
      stop: w.stop,
      note: w.note ?? '',
    })
    setEditorOpen(true)
  }

  async function save() {
    if (!form.symbol.trim()) return
    const body = { ...form, note: form.note || null }
    if (editingId) {
      const { item } = await api.put<{ item: WatchItem }>(`/watchlist/${editingId}`, body)
      setItems((list) => list.map((w) => (w.id === item.id ? item : w)))
    } else {
      const { item } = await api.post<{ item: WatchItem }>('/watchlist', body)
      setItems((list) => [item, ...list])
    }
    setEditorOpen(false)
  }

  async function togglePin(w: WatchItem) {
    const { item } = await api.put<{ item: WatchItem }>(`/watchlist/${w.id}`, { pinned: !w.pinned })
    setItems((list) =>
      [...list.map((x) => (x.id === item.id ? item : x))].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    )
  }

  async function doDelete(w: WatchItem) {
    await api.del(`/watchlist/${w.id}`)
    setItems((list) => list.filter((x) => x.id !== w.id))
  }

  if (!loaded) return <PageLoader />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">Інструменти під наглядом — з упередженням і ключовими рівнями.</p>
        <Button onClick={openNew}>
          <IconPlus width={17} height={17} /> Додати
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<IconTarget width={24} height={24} />}
          title="Список порожній"
          description="Додайте інструменти, за якими стежите, з упередженням і рівнями входу/цілі/стопу."
          action={
            <Button onClick={openNew}>
              <IconPlus width={17} height={17} /> Додати інструмент
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => (
            <div key={w.id} className="surface-card group rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold tracking-tight text-text">{w.symbol}</span>
                  <BiasBadge bias={w.bias} />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <a
                    href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(w.symbol)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-accent"
                    title="Відкрити в TradingView"
                  >
                    <IconExternal width={15} height={15} />
                  </a>
                  <button
                    onClick={() => togglePin(w)}
                    className={`grid h-8 w-8 place-items-center rounded-lg ${w.pinned ? 'text-warn' : 'text-subtle hover:text-text'}`}
                  >
                    <IconPin width={15} height={15} />
                  </button>
                  <button
                    onClick={() => openEdit(w)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-text"
                  >
                    <IconEdit width={15} height={15} />
                  </button>
                  <button
                    onClick={() => setToDelete(w)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-loss"
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
              </div>

              {(w.entry != null || w.target != null || w.stop != null) && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-subtle">Вхід</div>
                    <div className="tnum text-[13px] font-semibold text-text">{price(w.entry)}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-subtle">Ціль</div>
                    <div className="tnum text-[13px] font-semibold text-profit">{price(w.target)}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-subtle">Стоп</div>
                    <div className="tnum text-[13px] font-semibold text-loss">{price(w.stop)}</div>
                  </div>
                </div>
              )}

              {w.note && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{w.note}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Редагувати інструмент' : 'Новий інструмент'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={save}>Зберегти</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Інструмент">
              <Input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="EURUSD"
                className="uppercase"
                autoFocus
              />
            </Field>
            <Field label="Упередження">
              <Select value={form.bias} onChange={(e) => setForm({ ...form, bias: e.target.value as Bias })}>
                <option value="long">Long</option>
                <option value="short">Short</option>
                <option value="neutral">Neutral</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Вхід">
              <NumberInput value={form.entry} onChange={(v) => setForm({ ...form, entry: v })} />
            </Field>
            <Field label="Ціль">
              <NumberInput value={form.target} onChange={(v) => setForm({ ...form, target: v })} />
            </Field>
            <Field label="Стоп">
              <NumberInput value={form.stop} onChange={(v) => setForm({ ...form, stop: v })} />
            </Field>
          </div>
          <Field label="Нотатка / ідея">
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Що чекаю, за яких умов входжу…"
              className="min-h-24"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Прибрати зі списку?"
        message={`${toDelete?.symbol} буде видалено зі спостереження.`}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void doDelete(toDelete)
          setToDelete(null)
        }}
      />
    </div>
  )
}
