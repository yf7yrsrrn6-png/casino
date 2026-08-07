import { useEffect, useState } from 'react'
import { api, type Plan, type TradeImage } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Card'
import { EmptyState, PageLoader, ConfirmDialog, Spinner } from '@/components/ui/Feedback'
import { ImageUploader } from '@/components/media/ImageUploader'
import { IconPlus, IconPin, IconTrash, IconPlans, IconCheck } from '@/components/ui/icons'
import { relativeTime } from '@/lib/format'

export function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [images, setImages] = useState<TradeImage[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Plan | null>(null)

  useEffect(() => {
    api
      .get<{ plans: Plan[] }>('/plans')
      .then(({ plans }) => {
        setPlans(plans)
        if (plans.length) setSelectedId(plans[0].id)
      })
      .finally(() => setLoaded(true))
  }, [])

  // Load the selected plan's body + images.
  useEffect(() => {
    if (!selectedId) return
    setDirty(false)
    api
      .get<{ plan: Plan; images: TradeImage[] }>(`/plans/${selectedId}`)
      .then(({ plan, images }) => {
        setTitle(plan.title)
        setContent(plan.content)
        setImages(images)
      })
      .catch(() => {})
  }, [selectedId])

  const selected = plans.find((p) => p.id === selectedId) ?? null

  async function createPlan() {
    const { plan } = await api.post<{ plan: Plan }>('/plans', { title: 'Новий план' })
    setPlans((p) => [plan, ...p])
    setSelectedId(plan.id)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    try {
      const { plan } = await api.put<{ plan: Plan }>(`/plans/${selected.id}`, { title, content })
      setPlans((list) => list.map((p) => (p.id === plan.id ? plan : p)))
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function togglePin(plan: Plan) {
    const { plan: updated } = await api.put<{ plan: Plan }>(`/plans/${plan.id}`, {
      pinned: !plan.pinned,
    })
    setPlans((list) =>
      [...list.map((p) => (p.id === updated.id ? updated : p))].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    )
  }

  async function doDelete(plan: Plan) {
    await api.del(`/plans/${plan.id}`)
    const next = plans.filter((p) => p.id !== plan.id)
    setPlans(next)
    if (selectedId === plan.id) setSelectedId(next[0]?.id ?? null)
  }

  if (!loaded) return <PageLoader />

  if (plans.length === 0)
    return (
      <EmptyState
        icon={<IconPlans width={24} height={24} />}
        title="Ще немає планів"
        description="Створюйте торгові плани, чеклісти й розбори з графіками — усе в одному місці."
        action={
          <Button onClick={createPlan}>
            <IconPlus width={17} height={17} /> Створити план
          </Button>
        }
      />
    )

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Sidebar list */}
      <div className="space-y-3">
        <Button variant="secondary" className="w-full" onClick={createPlan}>
          <IconPlus width={17} height={17} /> Новий план
        </Button>
        <div className="space-y-1.5">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`focus-ring w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                selectedId === p.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-surface hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {p.pinned && <IconPin width={13} height={13} className="text-warn" />}
                <span className="truncate text-[14px] font-semibold text-text">{p.title}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-subtle">{relativeTime(p.updatedAt)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
              className="!text-lg !font-bold border-transparent hover:border-border bg-transparent px-2"
              placeholder="Назва плану"
            />
            <button
              onClick={() => togglePin(selected)}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border ${
                selected.pinned ? 'text-warn' : 'text-subtle hover:text-text'
              }`}
              title={selected.pinned ? 'Відкріпити' : 'Закріпити'}
            >
              <IconPin width={17} height={17} />
            </button>
            <button
              onClick={() => setToDelete(selected)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-subtle hover:border-loss hover:text-loss"
              title="Видалити"
            >
              <IconTrash width={17} height={17} />
            </button>
          </div>

          <Textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            placeholder="Опишіть свій план, правила входу, ризик-менеджмент, чекліст…"
            className="mt-3 min-h-64 border-transparent bg-surface-2/40 focus:bg-surface"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[12px] text-subtle">
              {dirty ? 'Є незбережені зміни' : 'Усе збережено'}
            </span>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner /> : <IconCheck width={16} height={16} />}
              Зберегти
            </Button>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-[13px] font-medium text-muted">Графіки та малюнки</div>
            <ImageUploader planId={selected.id} images={images} onChange={setImages} />
          </div>
        </Card>
      ) : (
        <Card className="grid place-items-center p-10 text-[13px] text-subtle">
          Виберіть план зі списку
        </Card>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Видалити план?"
        message={`«${toDelete?.title}» буде видалено назавжди.`}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void doDelete(toDelete)
          setToDelete(null)
        }}
      />
    </div>
  )
}
