import { useMemo, useState } from 'react'
import { money } from '@/lib/format'

interface Point {
  t: number
  equity: number
}

/**
 * Lightweight responsive equity curve — an area+line chart drawn as inline SVG
 * (no chart dependency). Uses a viewBox so it scales to any container width.
 */
export function EquityChart({
  data,
  currency,
  height = 240,
}: {
  data: Point[]
  currency: string
  height?: number
}) {
  const W = 760
  const H = height
  const padX = 8
  const padY = 16
  const [hover, setHover] = useState<number | null>(null)

  const geom = useMemo(() => {
    if (data.length < 2) return null
    const values = data.map((d) => d.equity)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= 1
      max += 1
    }
    const range = max - min
    const start = data[0].equity
    const x = (i: number) => padX + (i / (data.length - 1)) * (W - padX * 2)
    const y = (v: number) => padY + (1 - (v - min) / range) * (H - padY * 2)
    const yStart = y(start)
    const linePts = data.map((d, i) => `${x(i)},${y(d.equity)}`)
    const areaPath = `M ${x(0)},${H - padY} L ${linePts.join(' L ')} L ${x(data.length - 1)},${H - padY} Z`
    const linePath = `M ${linePts.join(' L ')}`
    return { x, y, yStart, areaPath, linePath, min, max, start }
  }, [data, H])

  if (!geom) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-surface-2/40 text-[13px] text-subtle"
        style={{ height }}
      >
        Замало даних для графіка — закрийте кілька позицій.
      </div>
    )
  }

  const last = data[data.length - 1].equity
  const up = last >= geom.start
  const stroke = up ? 'var(--profit)' : 'var(--loss)'
  const hovered = hover != null ? data[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const rel = (e.clientX - rect.left) / rect.width
          const idx = Math.round(rel * (data.length - 1))
          setHover(Math.max(0, Math.min(data.length - 1, idx)))
        }}
      >
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Starting balance baseline */}
        <line
          x1={padX}
          x2={W - padX}
          y1={geom.yStart}
          y2={geom.yStart}
          stroke="var(--border-strong)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <path d={geom.areaPath} fill="url(#equityFill)" />
        <path
          d={geom.linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {hovered && (
          <g>
            <line
              x1={geom.x(hover!)}
              x2={geom.x(hover!)}
              y1={padY}
              y2={H - padY}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            <circle
              cx={geom.x(hover!)}
              cy={geom.y(hovered.equity)}
              r={4}
              fill="var(--surface)"
              stroke={stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute left-3 top-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] shadow-md">
          <div className="tnum font-bold text-text">{money(hovered.equity, currency)}</div>
        </div>
      )}
    </div>
  )
}
