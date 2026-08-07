import { useEffect, useMemo, useState } from 'react'
import { api, type Direction, type TradeImage } from '@/lib/api'
import { useTrades, type TradeFormInput } from '@/store/useTrades'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Feedback'
import { ImageUploader } from '@/components/media/ImageUploader'
import {
  DirectionToggle,
  StatusToggle,
  StarRating,
  TagInput,
  NumberInput,
  ChecklistEditor,
  ConfidencePicker,
} from './parts'
import { useSettings } from '@/store/useSettings'
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/format'

const EMPTY: TradeFormInput = {
  symbol: '',
  direction: 'long',
  status: 'open',
  entryPrice: null,
  exitPrice: null,
  stopLoss: null,
  takeProfit: null,
  size: null,
  riskAmount: null,
  pnl: null,
  fees: null,
  session: null,
  setup: null,
  plan: null,
  notes: null,
  rating: null,
  tags: [],
  timeframe: null,
  emotion: null,
  mistakes: null,
  checklist: [],
  confidence: null,
  mae: null,
  mfe: null,
  openedAt: Date.now(),
  closedAt: null,
}

const SESSIONS = ['Asia', 'London', 'New York', 'Frankfurt', 'Sydney']
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W']
const EMOTIONS = ['Спокій', 'Впевненість', 'Дисципліна', 'FOMO', 'Жадібність', 'Страх', 'Помста', 'Нетерпіння']

export function TradeEditor() {
  const open = useTrades((s) => s.editorOpen)
  const editing = useTrades((s) => s.editing)
  const close = useTrades((s) => s.closeEditor)
  const save = useTrades((s) => s.save)
  const checklistTemplate = useSettings((s) => s.settings.checklistTemplate)

  const [form, setForm] = useState<TradeFormInput>(EMPTY)
  const [images, setImages] = useState<TradeImage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setForm({
        symbol: editing.symbol,
        direction: editing.direction,
        status: editing.status,
        entryPrice: editing.entryPrice,
        exitPrice: editing.exitPrice,
        stopLoss: editing.stopLoss,
        takeProfit: editing.takeProfit,
        size: editing.size,
        riskAmount: editing.riskAmount,
        pnl: editing.pnl,
        fees: editing.fees,
        session: editing.session,
        setup: editing.setup,
        plan: editing.plan,
        notes: editing.notes,
        rating: editing.rating,
        tags: editing.tags,
        timeframe: editing.timeframe,
        emotion: editing.emotion,
        mistakes: editing.mistakes,
        checklist: editing.checklist ?? [],
        confidence: editing.confidence,
        mae: editing.mae,
        mfe: editing.mfe,
        openedAt: editing.openedAt,
        closedAt: editing.closedAt,
      })
      // Load attached images for this trade.
      api
        .get<{ images: TradeImage[] }>(`/trades/${editing.id}`)
        .then(({ images }) => setImages(images))
        .catch(() => setImages([]))
    } else {
      setForm({
        ...EMPTY,
        openedAt: Date.now(),
        checklist: checklistTemplate.map((text) => ({ text, done: false })),
      })
      setImages([])
    }
  }, [open, editing, checklistTemplate])

  const set = <K extends keyof TradeFormInput>(key: K, value: TradeFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Live planned risk:reward from entry / stop / target.
  const entryPrice = form.entryPrice
  const stopLoss = form.stopLoss
  const takeProfit = form.takeProfit
  const plannedRR = useMemo(() => {
    if (entryPrice == null || stopLoss == null || takeProfit == null) return null
    const risk = Math.abs(entryPrice - stopLoss)
    const reward = Math.abs(takeProfit - entryPrice)
    if (risk === 0) return null
    return reward / risk
  }, [entryPrice, stopLoss, takeProfit])

  const isClosed = form.status === 'closed'

  async function onSave() {
    if (!form.symbol.trim()) {
      setError('Вкажіть інструмент (напр. EURUSD).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: TradeFormInput = {
        ...form,
        symbol: form.symbol.trim().toUpperCase(),
        closedAt: isClosed ? (form.closedAt ?? Date.now()) : null,
      }
      await save(payload, editing?.id)
      close()
    } catch {
      setError('Не вдалося зберегти. Спробуйте ще раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title={editing ? 'Редагувати позицію' : 'Нова позиція'}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Скасувати
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? <Spinner /> : 'Зберегти'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column — the trade */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Інструмент">
              <Input
                value={form.symbol}
                onChange={(e) => set('symbol', e.target.value)}
                placeholder="EURUSD"
                autoFocus
                className="uppercase"
              />
            </Field>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-muted">Статус</div>
              <StatusToggle value={form.status} onChange={(s) => set('status', s)} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-muted">Напрям</div>
            <DirectionToggle
              value={form.direction}
              onChange={(d: Direction) => set('direction', d)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Вхід">
              <NumberInput value={form.entryPrice} onChange={(v) => set('entryPrice', v)} placeholder="1.0850" />
            </Field>
            <Field label="Stop Loss">
              <NumberInput value={form.stopLoss} onChange={(v) => set('stopLoss', v)} placeholder="1.0820" />
            </Field>
            <Field label="Take Profit">
              <NumberInput value={form.takeProfit} onChange={(v) => set('takeProfit', v)} placeholder="1.0910" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Обсяг (лоти/од.)">
              <NumberInput value={form.size} onChange={(v) => set('size', v)} placeholder="0.50" />
            </Field>
            <Field label="Ризик ($)">
              <NumberInput value={form.riskAmount} onChange={(v) => set('riskAmount', v)} prefix="$" placeholder="100" />
            </Field>
            <Field label="Комісія ($)">
              <NumberInput value={form.fees} onChange={(v) => set('fees', v)} prefix="$" placeholder="0" />
            </Field>
          </div>

          {plannedRR != null && (
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
              <span className="text-muted">Плановий R:R</span>
              <span className="tnum font-bold text-text">1 : {plannedRR.toFixed(2)}</span>
              {form.riskAmount != null && (
                <span className="tnum ml-auto text-muted">
                  потенціал {`+$${(form.riskAmount * plannedRR).toFixed(0)}`}
                </span>
              )}
            </div>
          )}

          {isClosed && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2/50 p-3">
              <Field label="Ціна виходу">
                <NumberInput value={form.exitPrice} onChange={(v) => set('exitPrice', v)} placeholder="1.0905" />
              </Field>
              <Field label="Результат P&L ($)" hint="+ прибуток / − збиток">
                <NumberInput value={form.pnl} onChange={(v) => set('pnl', v)} prefix="$" placeholder="240" />
              </Field>
              <Field label="MAE" hint="макс. проти позиції">
                <NumberInput value={form.mae} onChange={(v) => set('mae', v)} placeholder="1.0835" />
              </Field>
              <Field label="MFE" hint="макс. за позицією">
                <NumberInput value={form.mfe} onChange={(v) => set('mfe', v)} placeholder="1.0925" />
              </Field>
            </div>
          )}
        </div>

        {/* Right column — context & analysis */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сетап / стратегія">
              <Input
                value={form.setup ?? ''}
                onChange={(e) => set('setup', e.target.value || null)}
                placeholder="напр. Order Block"
              />
            </Field>
            <Field label="Сесія">
              <Input
                list="sessions"
                value={form.session ?? ''}
                onChange={(e) => set('session', e.target.value || null)}
                placeholder="London"
              />
              <datalist id="sessions">
                {SESSIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Таймфрейм">
              <Input
                list="timeframes"
                value={form.timeframe ?? ''}
                onChange={(e) => set('timeframe', e.target.value || null)}
                placeholder="4H"
              />
              <datalist id="timeframes">
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Емоція / стан">
              <Input
                list="emotions"
                value={form.emotion ?? ''}
                onChange={(e) => set('emotion', e.target.value || null)}
                placeholder="Дисципліна"
              />
              <datalist id="emotions">
                {EMOTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Відкрито">
              <Input
                type="datetime-local"
                value={toDatetimeLocal(form.openedAt)}
                onChange={(e) => set('openedAt', fromDatetimeLocal(e.target.value))}
              />
            </Field>
            {isClosed && (
              <Field label="Закрито">
                <Input
                  type="datetime-local"
                  value={toDatetimeLocal(form.closedAt)}
                  onChange={(e) => set('closedAt', fromDatetimeLocal(e.target.value))}
                />
              </Field>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-muted">Впевненість до входу</div>
            <ConfidencePicker value={form.confidence} onChange={(v) => set('confidence', v)} />
          </div>

          <Field label="Теги">
            <TagInput tags={form.tags} onChange={(t) => set('tags', t)} />
          </Field>

          {isClosed && (
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-muted">Оцінка виконання</div>
              <StarRating value={form.rating} onChange={(v) => set('rating', v)} />
            </div>
          )}

          <Field label="План угоди">
            <Textarea
              value={form.plan ?? ''}
              onChange={(e) => set('plan', e.target.value || null)}
              placeholder="Ідея, точка входу, умови, куди ставлю стоп/тейк…"
              className="min-h-20"
            />
          </Field>

          {isClosed && (
            <>
              <Field label="Розбір після угоди">
                <Textarea
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value || null)}
                  placeholder="Що спрацювало, що ні, висновки…"
                  className="min-h-20"
                />
              </Field>
              <Field label="Помилки">
                <Textarea
                  value={form.mistakes ?? ''}
                  onChange={(e) => set('mistakes', e.target.value || null)}
                  placeholder="Чого не варто було робити — щоб не повторювати…"
                  className="min-h-16"
                />
              </Field>
            </>
          )}
        </div>

        {/* Full-width — pre-trade discipline checklist */}
        <div className="lg:col-span-2">
          <div className="mb-2 text-[13px] font-medium text-muted">
            Пре-трейд чеклист (дисципліна)
          </div>
          <ChecklistEditor
            items={form.checklist}
            onChange={(c) => set('checklist', c)}
            template={checklistTemplate}
          />
        </div>

        {/* Full-width — chart analysis images */}
        <div className="lg:col-span-2">
          <div className="mb-2 text-[13px] font-medium text-muted">Графіки та аналіз</div>
          <ImageUploader
            tradeId={editing?.id}
            images={images}
            onChange={setImages}
            disabledHint="Збережіть позицію, після чого зможете додати скріншоти графіків."
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-loss-soft px-3 py-2.5 text-[13px] font-medium text-loss">
          {error}
        </div>
      )}
    </Modal>
  )
}
