import type { ReactNode } from 'react'
import type { Direction, TradeStatus } from '@/lib/api'
import { IconArrowUp, IconArrowDown } from './icons'
import { money, rMultiple } from '@/lib/format'

export function DirectionBadge({ direction }: { direction: Direction }) {
  const long = direction === 'long'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        long ? 'bg-profit-soft text-profit' : 'bg-loss-soft text-loss'
      }`}
    >
      {long ? <IconArrowUp width={11} height={11} /> : <IconArrowDown width={11} height={11} />}
      {long ? 'Long' : 'Short'}
    </span>
  )
}

export function StatusBadge({ status }: { status: TradeStatus }) {
  const open = status === 'open'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        open ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-accent' : 'bg-subtle'}`} />
      {open ? 'Відкрита' : 'Закрита'}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  )
}

/** Coloured money value: green for profit, red for loss. */
export function PnL({
  value,
  currency = 'USD',
  className = '',
}: {
  value: number | null | undefined
  currency?: string
  className?: string
}) {
  const v = value ?? 0
  const color = v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted'
  return <span className={`tnum font-semibold ${color} ${className}`}>{money(value, currency, true)}</span>
}

export function RValue({ value }: { value: number | null | undefined }) {
  const v = value ?? 0
  const color = v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted'
  return <span className={`tnum font-semibold ${color}`}>{rMultiple(value)}</span>
}
