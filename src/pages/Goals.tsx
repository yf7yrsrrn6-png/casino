import { useEffect, useState } from 'react'
import { api, type Goal, type GoalMetric, type GoalPeriod } from '@/lib/api'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, PageLoader, ConfirmDialog } from '@/components/ui/Feedback'
import { NumberInput } from '@/components/trades/parts'
import { IconPlus, IconTrash, IconEdit, IconTarget, IconCheck } from '@/components/ui/icons'
import { computeGoalProgress, METRIC_LABEL, PERIOD_LABEL } from '@/lib/goals'

interface FormState {
  title: string
  metric: GoalMetric
  target: number | null
  period: GoalPeriod
}
const EMPTY: FormState = { title: '', metric: 'net_pnl', target: null, period: 'month' }

export function Goals() {
  const trades = useTrades((s) => s.trades)
  const currency = useSettings((s) => s.settings.currency)

  const [goals, setGoals] = useState<Goal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [toDelete, setToDelete] = useState<Goal | null>(null)

  useEffect(() => {
    api
      .get<{ goals: Goal[] }>('/goals')
      .then(({ goals }) => setGoals(goals))
      .finally(() => setLoaded(true))
  }, [])

  function openNew() {
    setEditingId(null)
    setForm(EMPTY)
    setOpen(true)
  }
  function openEdit(g: Goal) {
    setEditingId(g.id)
    setForm({ title: g.title, metric: g.metric, target: g.target, period: g.period })
    setOpen(true)
  }

  async function save() {
    if (!form.title.trim() || form.target == null) return
    const body = { title: form.title, metric: form.metric, target: form.target, period: form.period }
    if (editingId) {
      const { goal } = await api.put<{ goal: Goal }>(`/goals/${editingId}`, body)
      setGoals((list) => list.map((g) => (g.id === goal.id ? goal : g)))
    } else {
      const { goal } = await api.post<{ goal: Goal }>('/goals', body)
      setGoals((list) => [goal, ...list])
    }
    setOpen(false)
  }

  async function doDelete(g: Goal) {
    await api.del(`/goals/${g.id}`)
    setGoals((list) => list.filter((x) => x.id !== g.id))
  }

  if (!loaded) return <PageLoader />

  const metricHint: Record<GoalMetric, string> = {
    net_pnl: 'у валюті',
    win_rate: 'у відсотках',
    trades: 'кількість',
    avg_rr: 'у R',
    profit_factor: 'коефіцієнт',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">Ставте цілі й відстежуйте прогрес за період.</p>
        <Button onClick={openNew}>
          <IconPlus width={17} height={17} /> Нова ціль
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={<IconTarget width={24} height={24} />}
          title="Ще немає цілей"
          description="Напр. «Місячний профіт $2000», «Вінрейт 60%» або «Не більше 30 угод на місяць»."
          action={
            <Button onClick={openNew}>
              <IconPlus width={17} height={17} /> Створити ціль
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const p = computeGoalProgress(g, trades, currency)
            return (
              <div key={g.id} className="surface-card group rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold text-text">{g.title}</div>
                    <div className="mt-0.5 text-[12px] text-subtle">
                      {METRIC_LABEL[g.metric]} · {PERIOD_LABEL[g.period]}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(g)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-text"
                    >
                      <IconEdit width={15} height={15} />
                    </button>
                    <button
                      onClick={() => setToDelete(g)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-loss"
                    >
                      <IconTrash width={15} height={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div className="tnum text-[26px] font-bold leading-none text-text">{p.display}</div>
                  <div className="tnum text-[13px] text-muted">ціль {p.targetDisplay}</div>
                </div>

                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${p.reached ? 'bg-profit' : 'bg-white'}`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className={p.reached ? 'font-semibold text-profit' : 'text-subtle'}>
                    {p.reached ? (
                      <span className="inline-flex items-center gap-1">
                        <IconCheck width={13} height={13} /> Досягнуто
                      </span>
                    ) : (
                      `${p.pct.toFixed(0)}%`
                    )}
                  </span>
                  <span className="tnum text-subtle">{p.pct.toFixed(0)}% від цілі</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Редагувати ціль' : 'Нова ціль'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={save}>Зберегти</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Назва">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="напр. Місячний профіт"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Метрика">
              <Select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value as GoalMetric })}
              >
                {(Object.keys(METRIC_LABEL) as GoalMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Період">
              <Select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value as GoalPeriod })}
              >
                {(Object.keys(PERIOD_LABEL) as GoalPeriod[]).map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Цільове значення" hint={metricHint[form.metric]}>
            <NumberInput value={form.target} onChange={(v) => setForm({ ...form, target: v })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Видалити ціль?"
        message={`«${toDelete?.title}» буде видалено.`}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void doDelete(toDelete)
          setToDelete(null)
        }}
      />
    </div>
  )
}
