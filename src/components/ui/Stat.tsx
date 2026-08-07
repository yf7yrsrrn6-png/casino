import type { ReactNode } from 'react'

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'profit' | 'loss' | 'accent'
  icon?: ReactNode
}) {
  const valueTone =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-text'
  return (
    <div className="surface-card group relative overflow-hidden rounded-2xl p-4 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-subtle">{label}</span>
        {icon && (
          <span className="text-subtle transition-colors group-hover:text-accent">{icon}</span>
        )}
      </div>
      <div
        className={`tnum mt-2.5 text-[27px] font-bold leading-none tracking-tight ${valueTone}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}
