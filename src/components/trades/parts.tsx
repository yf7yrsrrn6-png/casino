import { useState, type KeyboardEvent } from 'react'
import type { ChecklistItem, Direction } from '@/lib/api'
import { Input } from '@/components/ui/Field'
import { IconArrowUp, IconArrowDown, IconStar, IconClose, IconCheck, IconPlus } from '@/components/ui/icons'

export function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Controlled numeric input that stores null when empty. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  step = 'any',
  prefix,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  step?: string
  prefix?: string
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(parseNum(e.target.value))}
        placeholder={placeholder}
        className={prefix ? 'pl-7' : ''}
      />
    </div>
  )
}

export function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction
  onChange: (d: Direction) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange('long')}
        className={`focus-ring flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors ${
          value === 'long'
            ? 'border-profit bg-profit-soft text-profit'
            : 'border-border bg-surface text-muted hover:border-border-strong'
        }`}
      >
        <IconArrowUp width={16} height={16} /> Long
      </button>
      <button
        type="button"
        onClick={() => onChange('short')}
        className={`focus-ring flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors ${
          value === 'short'
            ? 'border-loss bg-loss-soft text-loss'
            : 'border-border bg-surface text-muted hover:border-border-strong'
        }`}
      >
        <IconArrowDown width={16} height={16} /> Short
      </button>
    </div>
  )
}

export function StatusToggle({
  value,
  onChange,
}: {
  value: 'open' | 'closed'
  onChange: (s: 'open' | 'closed') => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
      {(['open', 'closed'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`focus-ring rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            value === s ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          {s === 'open' ? 'Відкрита' : 'Закрита'}
        </button>
      ))}
    </div>
  )
}

export function StarRating({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className="focus-ring rounded p-0.5"
          aria-label={`${n} зірок`}
        >
          <IconStar
            width={22}
            height={22}
            className={
              value != null && n <= value
                ? 'fill-warn text-warn'
                : 'fill-transparent text-border-strong'
            }
          />
        </button>
      ))}
    </div>
  )
}

export function ConfidencePicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`focus-ring h-7 w-7 rounded-lg border text-[13px] font-bold transition-colors ${
            value != null && n <= value
              ? 'border-white bg-white text-[#0a0b0d]'
              : 'border-border bg-surface-2 text-muted hover:border-border-strong'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Pre-trade discipline checklist with an inline add and live score. */
export function ChecklistEditor({
  items,
  onChange,
  template,
}: {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void
  template?: string[]
}) {
  const [draft, setDraft] = useState('')
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  function add(text: string) {
    const t = text.trim()
    if (!t) return
    onChange([...items, { text: t, done: false }])
    setDraft('')
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      {items.length === 0 && template && template.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(template.map((text) => ({ text, done: false })))}
          className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-text"
        >
          <IconPlus width={13} height={13} /> Завантажити мій чеклист
        </button>
      )}

      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = items.slice()
                next[i] = { ...item, done: !item.done }
                onChange(next)
              }}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                item.done ? 'border-white bg-white text-[#0a0b0d]' : 'border-border-strong text-transparent'
              }`}
            >
              <IconCheck width={13} height={13} />
            </button>
            <input
              value={item.text}
              onChange={(e) => {
                const next = items.slice()
                next[i] = { ...item, text: e.target.value }
                onChange(next)
              }}
              className={`flex-1 bg-transparent text-[13px] outline-none ${
                item.done ? 'text-subtle line-through' : 'text-text'
              }`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-subtle hover:text-loss"
            >
              <IconClose width={14} height={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <IconPlus width={14} height={14} className="text-subtle" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            }
          }}
          onBlur={() => add(draft)}
          placeholder="Додати пункт…"
          className="flex-1 bg-transparent text-[13px] text-text placeholder:text-subtle outline-none"
        />
      </div>

      {items.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
          <span className="tnum text-[12px] font-semibold text-muted">
            Дисципліна {pct}% · {done}/{items.length}
          </span>
        </div>
      )}
    </div>
  )
}

export function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add(raw: string) {
    const parts = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const next = [...tags]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next)
    setDraft('')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (draft.trim()) add(draft)
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="focus-within:shadow-[0_0_0_3px_var(--ring)] flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[12px] font-medium text-text"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-subtle hover:text-loss"
          >
            <IconClose width={12} height={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={tags.length ? '' : 'напр. FVG, London, breakout'}
        className="min-w-24 flex-1 bg-transparent py-1 text-sm text-text placeholder:text-subtle focus:outline-none"
      />
    </div>
  )
}
