import type { ReactNode } from 'react'

export function ResultRow({
  label,
  value,
  tone = 'default',
  big = false,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'profit' | 'loss' | 'accent'
  big?: boolean
}) {
  const color =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-text'
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`tnum font-bold ${big ? 'text-xl' : 'text-[15px]'} ${color}`}>{value}</span>
    </div>
  )
}

export function ResultPanel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2/50 px-4 py-2 divide-y divide-border">
      {children}
    </div>
  )
}
