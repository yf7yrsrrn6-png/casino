import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/trades/parts'
import { useSettings } from '@/store/useSettings'
import { money, num, pct } from '@/lib/format'
import { ResultPanel, ResultRow } from './parts'
import { IconTarget } from '@/components/ui/icons'

/**
 * Risk : Reward and expected P&L for a planned trade, plus the break-even win
 * rate the setup needs to be profitable.
 */
export function RiskRewardCalc() {
  const currency = useSettings((s) => s.settings.currency)
  const [entry, setEntry] = useState<number | null>(null)
  const [stop, setStop] = useState<number | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [risk, setRisk] = useState<number | null>(100)

  const r = useMemo(() => {
    if (entry == null || stop == null || target == null || entry === stop) return null
    const riskDist = Math.abs(entry - stop)
    const rewardDist = Math.abs(target - entry)
    const rr = rewardDist / riskDist
    const reward = risk != null ? risk * rr : null
    const breakeven = 100 / (1 + rr)
    return { rr, reward, breakeven, riskDist, rewardDist }
  }, [entry, stop, target, risk])

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconTarget width={18} height={18} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">Risk / Reward та P&L</h3>
          <p className="text-[12px] text-muted">Співвідношення, потенціал і беззбитковий вінрейт</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ціна входу">
          <NumberInput value={entry} onChange={setEntry} placeholder="1.0850" />
        </Field>
        <Field label="Stop Loss">
          <NumberInput value={stop} onChange={setStop} placeholder="1.0820" />
        </Field>
        <Field label="Take Profit">
          <NumberInput value={target} onChange={setTarget} placeholder="1.0920" />
        </Field>
        <Field label="Сума ризику">
          <NumberInput value={risk} onChange={setRisk} prefix="$" placeholder="100" />
        </Field>
      </div>

      {r && (
        <ResultPanel>
          <ResultRow label="Співвідношення R:R" value={`1 : ${num(r.rr, 2)}`} tone="accent" big />
          {r.reward != null && (
            <ResultRow label="Потенційний профіт" value={money(r.reward, currency, true)} tone="profit" />
          )}
          {risk != null && (
            <ResultRow label="Потенційний збиток" value={money(-risk, currency, true)} tone="loss" />
          )}
          <ResultRow label="Беззбитковий вінрейт" value={pct(r.breakeven)} />
        </ResultPanel>
      )}
    </Card>
  )
}
