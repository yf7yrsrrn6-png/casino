import { useState, type KeyboardEvent } from 'react'
import type { Direction } from '@/lib/api'
import { Input } from '@/components/ui/Field'
import { IconArrowUp, IconArrowDown, IconStar, IconClose } from '@/components/ui/icons'

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
