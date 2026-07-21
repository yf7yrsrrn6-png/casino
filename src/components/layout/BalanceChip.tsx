import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function BalanceChip({ balance }: { balance: number }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/wallet"
      className="flex items-center gap-2 rounded-full border border-gold/30 bg-gradient-to-r from-surface-2 to-surface-3 py-1.5 pl-1.5 pr-3.5 hover:border-gold/60 transition-colors group"
      title={t('nav.wallet')}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-gold-soft to-gold text-xs">
        🪙
      </span>
      <span className="font-mono text-sm font-bold text-gold-soft tabular-nums">
        {balance.toLocaleString('en-US')}
      </span>
      <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-white/40 group-hover:text-white/60 sm:inline">
        {t('common.currencyShort')}
      </span>
    </Link>
  )
}
