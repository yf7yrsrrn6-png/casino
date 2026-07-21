import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function BalanceChip({ balance }: { balance: number }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/wallet"
      className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2 hover:border-gold/60 transition-colors"
      title={t('nav.wallet')}
    >
      <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_var(--color-gold)]" />
      <span className="font-display text-sm font-extrabold text-gold-soft tabular-nums">
        {balance.toLocaleString('en-US')}
      </span>
      <span className="hidden text-[10px] font-bold uppercase tracking-wide text-gold-soft/50 sm:inline">
        {t('common.currencyShort')}
      </span>
    </Link>
  )
}
