import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentWallet } from '@/store/useCurrentWallet'
import { Button } from '@/components/ui/Button'
import type { TransactionRecord } from '@/types'

const TOP_UP_PRESETS = [500, 1000, 5000, 10000]

const TYPE_ICON: Record<TransactionRecord['type'], string> = {
  deposit: '💳',
  bet: '🎲',
  win: '🏆',
  bonus: '🎁',
}

export function Wallet() {
  const { t, i18n } = useTranslation()
  const { balance, transactions, deposit, resetBalance, startingBalance } = useCurrentWallet()
  const [customAmount, setCustomAmount] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  function handleTopUp(amount: number) {
    if (amount <= 0) return
    deposit(amount)
    setToast(t('wallet.successTopUp'))
    setCustomAmount('')
    window.setTimeout(() => setToast(null), 2500)
  }

  function handleReset() {
    if (!confirmingReset) {
      setConfirmingReset(true)
      window.setTimeout(() => setConfirmingReset(false), 3000)
      return
    }
    resetBalance()
    setConfirmingReset(false)
  }

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {t('wallet.title')}
        </h1>
        <p className="mt-2 text-white/50">{t('wallet.subtitle')}</p>
      </div>

      {/* Balance */}
      <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-surface-2 to-surface p-8 text-center shadow-glow-gold">
        <div className="text-xs font-bold uppercase tracking-wide text-white/40">
          {t('wallet.currentBalance')}
        </div>
        <div className="mt-2 font-display text-4xl font-extrabold text-gold-soft sm:text-5xl">
          {balance.toLocaleString('en-US')}{' '}
          <span className="text-lg font-semibold text-white/40">{t('common.currencyShort')}</span>
        </div>
      </div>

      {/* Top up */}
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-bold text-white">{t('wallet.topUp')}</h2>
        <p className="mt-1 text-sm text-white/45">{t('wallet.topUpSubtitle')}</p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOP_UP_PRESETS.map((amount) => (
            <button
              key={amount}
              onClick={() => handleTopUp(amount)}
              className="rounded-xl border border-border bg-surface-2 py-3 text-center font-mono font-bold text-gold-soft transition-colors hover:border-gold/50 cursor-pointer"
            >
              +{amount.toLocaleString('en-US')}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="number"
            min={1}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder={t('wallet.customAmount')}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold/50"
          />
          <Button
            onClick={() => handleTopUp(Number(customAmount))}
            disabled={!customAmount || Number(customAmount) <= 0}
          >
            {t('wallet.addFunds')}
          </Button>
        </div>

        {toast && (
          <div className="mt-4 rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-2.5 text-sm text-emerald">
            {toast}
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">{t('wallet.history')}</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-white/40">{t('wallet.noHistory')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-base">
                    {TYPE_ICON[tx.type]}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white/80">
                      {t(`wallet.type${tx.type.charAt(0).toUpperCase()}${tx.type.slice(1)}`)}
                      {tx.label ? ` · ${tx.label}` : ''}
                    </div>
                    <div className="text-xs text-white/35">{dateFormatter.format(tx.date)}</div>
                  </div>
                </div>
                <span
                  className={`font-mono text-sm font-bold ${tx.amount >= 0 ? 'text-emerald' : 'text-ruby'}`}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount.toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-surface p-6">
        <div>
          <h2 className="font-bold text-white/80">{t('wallet.resetBalance')}</h2>
          <p className="mt-1 text-xs text-white/40">
            {confirmingReset
              ? t('wallet.resetConfirm')
              : `${t('wallet.resetBalance')} → ${startingBalance.toLocaleString('en-US')}`}
          </p>
        </div>
        <Button variant={confirmingReset ? 'danger' : 'secondary'} onClick={handleReset}>
          {confirmingReset ? t('common.confirm') : t('wallet.resetBalance')}
        </Button>
      </div>
    </div>
  )
}
