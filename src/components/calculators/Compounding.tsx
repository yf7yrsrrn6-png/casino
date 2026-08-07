import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/trades/parts'
import { useSettings } from '@/store/useSettings'
import { money, num } from '@/lib/format'
import { ResultPanel, ResultRow } from './parts'
import { IconTrend } from '@/components/ui/icons'

/**
 * Compounding growth: final balance after N periods at a fixed % gain, plus how
 * many periods it takes to reach a target balance. Includes a growth sparkline.
 */
export function CompoundingCalc() {
  const settings = useSettings((s) => s.settings)
  const [start, setStart] = useState<number | null>(settings.accountBalance)
  const [gain, setGain] = useState<number | null>(1)
  const [periods, setPeriods] = useState<number | null>(100)
  const [target, setTarget] = useState<number | null>(null)

  const r = useMemo(() => {
    if (start == null || gain == null || periods == null || start <= 0) return null
    const g = gain / 100
    const final = start * Math.pow(1 + g, periods)
    const profit = final - start
    const series: number[] = []
    const steps = Math.min(periods, 60)
    for (let i = 0; i <= steps; i++) {
      const p = (i / steps) * periods
      series.push(start * Math.pow(1 + g, p))
    }
    let periodsToTarget: number | null = null
    if (target != null && target > start && g > 0) {
      periodsToTarget = Math.log(target / start) / Math.log(1 + g)
    }
    return { final, profit, series, periodsToTarget }
  }, [start, gain, periods, target])

  const spark = useMemo(() => {
    if (!r) return null
    const max = Math.max(...r.series)
    const min = Math.min(...r.series)
    const range = max - min || 1
    const W = 300
    const H = 60
    const pts = r.series.map((v, i) => {
      const x = (i / (r.series.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return { path: `M ${pts.join(' L ')}`, W, H }
  }, [r])

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconTrend width={18} height={18} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">Складний відсоток / Ціль</h3>
          <p className="text-[12px] text-muted">Ріст депозиту та шлях до фінансової цілі</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Стартовий депозит">
          <NumberInput value={start} onChange={setStart} prefix={settings.currency === 'USD' ? '$' : ''} />
        </Field>
        <Field label="Приріст / період, %">
          <NumberInput value={gain} onChange={setGain} placeholder="1" />
        </Field>
        <Field label="К-сть періодів" hint="угод / днів">
          <NumberInput value={periods} onChange={setPeriods} placeholder="100" />
        </Field>
        <Field label="Ціль (необов.)">
          <NumberInput value={target} onChange={setTarget} prefix={settings.currency === 'USD' ? '$' : ''} />
        </Field>
      </div>

      {r && spark && (
        <>
          <div className="mt-4 rounded-xl border border-border bg-surface-2/40 p-3">
            <svg viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none" className="h-16 w-full">
              <path
                d={spark.path}
                fill="none"
                stroke="var(--profit)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <ResultPanel>
            <ResultRow label="Кінцевий баланс" value={money(r.final, settings.currency)} tone="profit" big />
            <ResultRow label="Загальний профіт" value={money(r.profit, settings.currency, true)} tone="profit" />
            {r.periodsToTarget != null && (
              <ResultRow
                label="Періодів до цілі"
                value={`≈ ${num(r.periodsToTarget, 0)}`}
                tone="accent"
              />
            )}
          </ResultPanel>
        </>
      )}
    </Card>
  )
}
