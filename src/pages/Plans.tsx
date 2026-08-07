import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Plan, type PlanKind, type TradeImage } from '@/lib/api'
import { useTrades } from '@/store/useTrades'
import { useSettings } from '@/store/useSettings'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Card'
import { EmptyState, PageLoader, ConfirmDialog, Spinner } from '@/components/ui/Feedback'
import { ImageUploader } from '@/components/media/ImageUploader'
import { IconPlus, IconPin, IconTrash, IconPlans, IconCheck, IconChevronDown } from '@/components/ui/icons'
import { relativeTime } from '@/lib/format'
import { buildReviewContent, PLAYBOOK_TEMPLATE } from '@/lib/reviews'

type Tab = 'note' | 'playbook' | 'review'

const TABS: { key: Tab; label: string; blank: string }[] = [
  { key: 'note', label: 'Плани', blank: 'Новий план' },
  { key: 'playbook', label: 'Плейбуки', blank: 'Новий плейбук' },
  { key: 'review', label: "Рев'ю", blank: "Нове рев'ю" },
]

const KIND_LABEL: Record<PlanKind, string> = { note: 'План', playbook: 'Плейбук', review: "Рев'ю" }

export function Plans() {
  const trades = useTrades((s) => s.trades)
  const currency = useSettings((s) => s.settings.currency)

  const [plans, setPlans] = useState<Plan[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('note')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [images, setImages] = useState<TradeImage[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Plan | null>(null)
  const [reviewMenu, setReviewMenu] = useState(false)

  const { id: routeId } = useParams<{ id: string }>()

  useEffect(() => {
    api
      .get<{ plans: Plan[] }>('/plans')
      .then(({ plans }) => {
        setPlans(plans)
        // Deep-link: open a specific record and switch to its tab.
        if (routeId) {
          const found = plans.find((p) => p.id === routeId)
          if (found) {
            setTab(found.kind)
            setSelectedId(found.id)
          }
        }
      })
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => plans.filter((p) => p.kind === tab), [plans, tab])

  // Keep a valid selection within the active tab.
  useEffect(() => {
    if (!visible.find((p) => p.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, plans])

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
  const counts = useMemo(
    () => ({
      note: plans.filter((p) => p.kind === 'note').length,
      playbook: plans.filter((p) => p.kind === 'playbook').length,
      review: plans.filter((p) => p.kind === 'review').length,
    }),
    [plans],
  )

  async function create(kind: PlanKind, presetTitle: string, presetContent = '') {
    const { plan } = await api.post<{ plan: Plan }>('/plans', {
      title: presetTitle,
      content: presetContent,
      kind,
    })
    setPlans((p) => [plan, ...p])
    setTab(kind)
    setSelectedId(plan.id)
  }

  function createReview(days: number, label: string) {
    setReviewMenu(false)
    const content = buildReviewContent(trades, days, currency)
    void create('review', `${label} · ${new Date().toLocaleDateString('uk-UA')}`, content)
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
    const { plan: updated } = await api.put<{ plan: Plan }>(`/plans/${plan.id}`, { pinned: !plan.pinned })
    setPlans((list) =>
      [...list.map((p) => (p.id === updated.id ? updated : p))].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    )
  }

  async function doDelete(plan: Plan) {
    await api.del(`/plans/${plan.id}`)
    setPlans((list) => list.filter((p) => p.id !== plan.id))
  }

  if (!loaded) return <PageLoader />

  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`focus-ring rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === t.key ? 'bg-accent-soft text-text' : 'text-muted hover:text-text'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-subtle">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {tab === 'review' ? (
          <div className="relative">
            <Button onClick={() => setReviewMenu((v) => !v)}>
              <IconPlus width={17} height={17} /> Створити рев'ю
              <IconChevronDown width={14} height={14} />
            </Button>
            {reviewMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setReviewMenu(false)} />
                <div className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                  {[
                    { d: 7, l: 'Тижневе рев’ю' },
                    { d: 30, l: 'Місячне рев’ю' },
                    { d: 90, l: 'Квартальне рев’ю' },
                    { d: 0, l: 'Порожнє' },
                  ].map((o) => (
                    <button
                      key={o.l}
                      onClick={() => (o.d ? createReview(o.d, o.l) : create('review', o.l))}
                      className="block w-full px-4 py-2.5 text-left text-[13px] text-text hover:bg-surface-2"
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <Button onClick={() => create(tab, activeTab.blank, tab === 'playbook' ? PLAYBOOK_TEMPLATE : '')}>
            <IconPlus width={17} height={17} /> {activeTab.blank}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconPlans width={24} height={24} />}
          title={`Розділ «${activeTab.label}» порожній`}
          description={
            tab === 'playbook'
              ? 'Опишіть свої стратегії — і прив’язуйте до них угоди через поле «Сетап».'
              : tab === 'review'
                ? 'Створюйте періодичні рев’ю — статистика підтягнеться автоматично.'
                : 'Створюйте плани, чеклісти й розбори з графіками.'
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* List */}
          <div className="space-y-1.5">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`focus-ring w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  selectedId === p.id ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2'
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

          {/* Editor */}
          {selected ? (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {KIND_LABEL[selected.kind]}
                </span>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setDirty(true)
                  }}
                  className="!text-lg !font-bold border-transparent hover:border-border bg-transparent px-2"
                  placeholder="Назва"
                />
                <button
                  onClick={() => togglePin(selected)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border ${selected.pinned ? 'text-warn' : 'text-subtle hover:text-text'}`}
                >
                  <IconPin width={17} height={17} />
                </button>
                <button
                  onClick={() => setToDelete(selected)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-subtle hover:border-loss hover:text-loss"
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
                placeholder="Пишіть тут…"
                className="mt-3 min-h-72 border-transparent bg-surface-2/40 font-mono text-[13px] leading-relaxed focus:bg-surface"
              />

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px] text-subtle">{dirty ? 'Є незбережені зміни' : 'Усе збережено'}</span>
                <Button onClick={save} disabled={!dirty || saving}>
                  {saving ? <Spinner /> : <IconCheck width={16} height={16} />} Зберегти
                </Button>
              </div>

              <div className="mt-6">
                <div className="mb-2 text-[13px] font-medium text-muted">Графіки та малюнки</div>
                <ImageUploader planId={selected.id} images={images} onChange={setImages} />
              </div>
            </Card>
          ) : (
            <Card className="grid place-items-center p-10 text-[13px] text-subtle">Виберіть запис</Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Видалити запис?"
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
