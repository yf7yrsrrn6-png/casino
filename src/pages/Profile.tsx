import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/store/useCurrentWallet'

export function Profile() {
  const { t, i18n } = useTranslation()
  const email = useAuthStore((s) => s.currentUserEmail)
  const accounts = useAuthStore((s) => s.accounts)
  const { balance, transactions, totalWagered, totalWon, gamesPlayed } = useCurrentWallet()

  const memberSince = email ? accounts[email]?.createdAt : undefined
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const favoriteGame = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.type === 'bet' && tx.label) {
        counts.set(tx.label, (counts.get(tx.label) ?? 0) + 1)
      }
    }
    let best: string | null = null
    let bestCount = 0
    for (const [label, count] of counts) {
      if (count > bestCount) {
        best = label
        bestCount = count
      }
    }
    return best
  }, [transactions])

  const recent = transactions.slice(0, 5)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            {t('profile.title')}
          </h1>
          <p className="mt-2 text-white/50">{t('profile.subtitle')}</p>
        </div>
        <Link
          to="/settings"
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-white/70 hover:border-gold/50 hover:text-white"
        >
          {t('profile.editSettings')}
        </Link>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-8 text-center sm:flex-row sm:text-left">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-surface-2 text-4xl">
          👤
        </span>
        <div>
          <div className="font-display text-xl font-bold text-white">{email}</div>
          {memberSince && (
            <div className="mt-1 text-sm text-white/40">
              {t('profile.memberSince')}: {dateFormatter.format(memberSince)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          [balance.toLocaleString('en-US'), t('wallet.currentBalance')],
          [totalWagered.toLocaleString('en-US'), t('profile.totalWagered')],
          [totalWon.toLocaleString('en-US'), t('profile.totalWon')],
          [String(gamesPlayed), t('profile.gamesPlayed')],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5 text-center">
            <div className="font-mono text-xl font-bold text-gold-soft">{value}</div>
            <div className="mt-1 text-xs text-white/40">{label}</div>
          </div>
        ))}
      </div>

      {favoriteGame && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-surface p-5">
          <span className="text-sm text-white/50">{t('profile.favoriteGame')}</span>
          <span className="font-semibold text-white">{favoriteGame}</span>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">
          {t('profile.recentActivity')}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-white/40">{t('profile.noActivity')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {recent.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-white/60">
                  {t(`wallet.type${tx.type.charAt(0).toUpperCase()}${tx.type.slice(1)}`)}
                  {tx.label ? ` · ${tx.label}` : ''}
                </span>
                <span className={`font-mono font-bold ${tx.amount >= 0 ? 'text-emerald' : 'text-ruby'}`}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
