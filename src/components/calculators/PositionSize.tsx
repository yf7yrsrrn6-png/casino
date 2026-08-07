import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/trades/parts'
import { useSettings } from '@/store/useSettings'
import { money, num } from '@/lib/format'
import { ResultPanel, ResultRow } from './parts'
import { IconScale } from '@/components/ui/icons'

/**
 * Position size from risk: how big a position keeps the loss at the chosen % of
 * the account if the stop is hit. Gives both raw units and forex lots.
 */
export function PositionSizeCalc() {
  const settings = useSettings((s) => s.settings)
  const [balance, setBalance] = useState<number | null>(settings.accountBalance)
  const [riskPct, setRiskPct] = useState<number | null>(settings.defaultRiskPct)
  const [entry, setEntry] = useState<number | null>(null)
  const [stop, setStop] = useState<number | null>(null)
  const [pipSize, setPipSize] = useState<number | null>(0.0001)
  const [pipValue, setPipValue] = useState<number | null>(10)

  const r = useMemo(() => {
    if (balance == null || riskPct == null) return null
    const riskAmount = (balance * riskPct) / 100
    if (entry == null || stop == null || entry === stop) return { riskAmount }
    const distance = Math.abs(entry - stop)
    const units = riskAmount / distance
    let lots: number | null = null
    let stopPips: number | null = null
    if (pipSize && pipValue && pipSize > 0 && pipValue > 0) {
      stopPips = distance / pipSize
      lots = riskAmount / (stopPips * pipValue)
    }
    return { riskAmount, distance, units, lots, stopPips }
  }, [balance, riskPct, entry, stop, pipSize, pipValue])

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconScale width={18} height={18} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">Розмір позиції за ризиком</h3>
          <p className="text-[12px] text-muted">Скільки брати, щоб втратити рівно свій % на стопі</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Депозит">
          <NumberInput value={balance} onChange={setBalance} prefix={settings.currency === 'USD' ? '$' : ''} />
        </Field>
        <Field label="Ризик, %">
          <NumberInput value={riskPct} onChange={setRiskPct} placeholder="1" />
        </Field>
        <Field label="Ціна входу">
          <NumberInput value={entry} onChange={setEntry} placeholder="1.0850" />
        </Field>
        <Field label="Stop Loss">
          <NumberInput value={stop} onChange={setStop} placeholder="1.0820" />
        </Field>
        <Field label="Розмір піпа" hint="0.0001 / 0.01">
          <NumberInput value={pipSize} onChange={setPipSize} />
        </Field>
        <Field label="Вартість піпа / лот" hint="$ за 1 лот">
          <NumberInput value={pipValue} onChange={setPipValue} prefix="$" />
        </Field>
      </div>

      {r && (
        <ResultPanel>
          <ResultRow label="Сума ризику" value={money(r.riskAmount, settings.currency)} tone="loss" />
          {'stopPips' in r && r.stopPips != null && (
            <ResultRow label="Стоп у піпах" value={`${num(r.stopPips, 1)} pips`} />
          )}
          {'lots' in r && r.lots != null && (
            <ResultRow label="Розмір позиції" value={`${num(r.lots, 2)} лот`} tone="accent" big />
          )}
          {'units' in r && r.units != null && (
            <ResultRow label="В одиницях" value={num(r.units, 0)} />
          )}
        </ResultPanel>
      )}
    </Card>
  )
}
