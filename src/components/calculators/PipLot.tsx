import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/trades/parts'
import { useSettings } from '@/store/useSettings'
import { money, num } from '@/lib/format'
import { ResultPanel, ResultRow } from './parts'
import { IconCoins } from '@/components/ui/icons'

/**
 * Pip value & lot conversion: turns a lot size into money-per-pip and raw units,
 * and estimates the P&L of a move in pips.
 */
export function PipLotCalc() {
  const currency = useSettings((s) => s.settings.currency)
  const [lots, setLots] = useState<number | null>(1)
  const [contract, setContract] = useState<number | null>(100000)
  const [pipValuePerLot, setPipValuePerLot] = useState<number | null>(10)
  const [movePips, setMovePips] = useState<number | null>(null)

  const r = useMemo(() => {
    if (lots == null) return null
    const units = contract != null ? lots * contract : null
    const pipValue = pipValuePerLot != null ? lots * pipValuePerLot : null
    const moveResult = pipValue != null && movePips != null ? pipValue * movePips : null
    return { units, pipValue, moveResult }
  }, [lots, contract, pipValuePerLot, movePips])

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconCoins width={18} height={18} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">Піпи та лоти</h3>
          <p className="text-[12px] text-muted">Вартість піпа, обсяг в одиницях і P&L руху</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Обсяг, лоти">
          <NumberInput value={lots} onChange={setLots} placeholder="1.0" />
        </Field>
        <Field label="Розмір контракту" hint="од. на 1 лот">
          <NumberInput value={contract} onChange={setContract} placeholder="100000" />
        </Field>
        <Field label="Вартість піпа / лот">
          <NumberInput value={pipValuePerLot} onChange={setPipValuePerLot} prefix="$" placeholder="10" />
        </Field>
        <Field label="Рух, піпи" hint="для P&L">
          <NumberInput value={movePips} onChange={setMovePips} placeholder="20" />
        </Field>
      </div>

      {r && (
        <ResultPanel>
          {r.pipValue != null && (
            <ResultRow label="Вартість піпа" value={money(r.pipValue, currency)} tone="accent" big />
          )}
          {r.units != null && <ResultRow label="Обсяг в одиницях" value={num(r.units, 0)} />}
          {r.moveResult != null && (
            <ResultRow
              label={`P&L за ${num(movePips, 0)} піпів`}
              value={money(r.moveResult, currency, true)}
              tone={r.moveResult >= 0 ? 'profit' : 'loss'}
            />
          )}
        </ResultPanel>
      )}
    </Card>
  )
}
