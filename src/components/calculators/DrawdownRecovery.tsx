import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/trades/parts'
import { useSettings } from '@/store/useSettings'
import { money } from '@/lib/format'
import { ResultPanel, ResultRow } from './parts'
import { IconTrend } from '@/components/ui/icons'

/** How large a gain is needed to recover a given drawdown — the asymmetry of loss. */
export function DrawdownRecoveryCalc() {
  const settings = useSettings((s) => s.settings)
  const [dd, setDd] = useState<number | null>(20)
  const [balance, setBalance] = useState<number | null>(settings.accountBalance)

  const r = useMemo(() => {
    if (dd == null || dd <= 0 || dd >= 100) return null
    const remaining = 1 - dd / 100
    const required = (1 / remaining - 1) * 100
    const lost = balance != null ? balance * (dd / 100) : null
    const low = balance != null ? balance * remaining : null
    return { required, lost, low }
  }, [dd, balance])

  const table = [5, 10, 20, 30, 40, 50, 60].map((d) => ({
    d,
    g: (1 / (1 - d / 100) - 1) * 100,
  }))

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconTrend width={18} height={18} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">Відновлення просадки</h3>
          <p className="text-[12px] text-muted">Який приріст потрібен, щоб відбити збиток</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Просадка, %">
          <NumberInput value={dd} onChange={setDd} placeholder="20" />
        </Field>
        <Field label="Депозит (необов.)">
          <NumberInput value={balance} onChange={setBalance} prefix={settings.currency === 'USD' ? '$' : ''} />
        </Field>
      </div>

      {r && (
        <ResultPanel>
          <ResultRow label="Потрібен приріст" value={`+${r.required.toFixed(1)}%`} tone="loss" big />
          {r.lost != null && <ResultRow label="Втрачено" value={money(r.lost, settings.currency)} />}
          {r.low != null && <ResultRow label="Баланс у просадці" value={money(r.low, settings.currency)} />}
        </ResultPanel>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface-2/40 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Асиметрія втрат
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {table.map((row) => (
            <div key={row.d}>
              <div className="tnum text-[12px] font-semibold text-loss">−{row.d}%</div>
              <div className="my-1 h-px bg-border" />
              <div className="tnum text-[12px] font-semibold text-profit">+{row.g.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
