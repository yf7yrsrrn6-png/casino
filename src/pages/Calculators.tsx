import { PositionSizeCalc } from '@/components/calculators/PositionSize'
import { RiskRewardCalc } from '@/components/calculators/RiskReward'
import { PipLotCalc } from '@/components/calculators/PipLot'
import { CompoundingCalc } from '@/components/calculators/Compounding'

export function Calculators() {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted">
        Депозит і ризик за замовчуванням підтягуються з ваших{' '}
        <span className="font-medium text-text">Налаштувань</span>. Усі розрахунки — миттєві.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <PositionSizeCalc />
        <RiskRewardCalc />
        <PipLotCalc />
        <CompoundingCalc />
      </div>
    </div>
  )
}
