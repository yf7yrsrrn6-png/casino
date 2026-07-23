import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type ApiUser, type ApiTransaction } from '@/lib/api'
import { useWallet } from '@/store/useWallet'

interface ProfileData {
  user: ApiUser
  stats: {
    balance: number
    totalWagered: number
    totalWon: number
    gamesPlayed: number
    favoriteGame: string | null
  }
}

export function Profile() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<ProfileData | null>(null)
  const transactions = useWallet((s) => s.transactions)
  const refresh = useWallet((s) => s.refresh)

  useEffect(() => {
    void api.get<ProfileData>('/account/profile').then(setData).catch(() => {})
    void refresh().catch(() => {})
  }, [refresh])

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const recent = transactions.slice(0, 6)

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[40svh] max-w-4xl items-center justify-center text-mist">
        <span className="animate-pulse">{t('common.loading')}</span>
      </div>
    )
  }

  const { user, stats } = data

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            {t('profile.title')}
          </h1>
          <p className="mt-2 text-lilac">{t('profile.subtitle')}</p>
        </div>
        <Link
          to="/settings"
          className="rounded-xl border border-white/12 px-4 py-2 text-sm font-semibold text-lilac hover:border-gold/50 hover:text-white"
        >
          {t('profile.editSettings')}
        </Link>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-surface p-8 text-center sm:flex-row sm:text-left">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-surface-2 text-4xl">
          👤
        </span>
        <div>
          <div className="font-display text-xl font-bold text-white">{user.displayName}</div>
          <div className="text-sm text-mist">{user.email}</div>
          <div className="mt-1 text-sm text-white/40">
            {t('profile.memberSince')}: {dateFormatter.format(user.createdAt)}
          </div>
        </div>
        {user.role === 'admin' && (
          <span className="rounded-lg bg-gold/15 px-3 py-1 text-xs font-bold text-gold-soft sm:ml-auto">
            ADMIN
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          [stats.balance.toLocaleString('en-US'), t('wallet.currentBalance')],
          [stats.totalWagered.toLocaleString('en-US'), t('profile.totalWagered')],
          [stats.totalWon.toLocaleString('en-US'), t('profile.totalWon')],
          [String(stats.gamesPlayed), t('profile.gamesPlayed')],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-surface p-5 text-center">
            <div className="font-mono text-xl font-bold text-gold-soft">{value}</div>
            <div className="mt-1 text-xs text-white/40">{label}</div>
          </div>
        ))}
      </div>

      {stats.favoriteGame && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-surface p-5">
          <span className="text-sm text-mist">{t('profile.favoriteGame')}</span>
          <span className="font-semibold text-white">{stats.favoriteGame}</span>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/10 bg-surface p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">
          {t('profile.recentActivity')}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-white/40">{t('profile.noActivity')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-white/8">
            {recent.map((tx: ApiTransaction) => (
              <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-lilac">
                  {t(`wallet.type${tx.type.charAt(0).toUpperCase()}${tx.type.slice(1)}`)}
                  {tx.label ? ` · ${tx.label}` : ''}
                </span>
                <span className={`font-mono font-bold ${tx.amount >= 0 ? 'text-emerald' : 'text-ruby'}`}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount.toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
