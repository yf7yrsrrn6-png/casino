import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useSession } from '@/store/useSession'

interface VipData {
  xp: number
  level: number
  tierName: string
  rakebackBps: number
  next: { level: number; name: string; minXp: number } | null
  progress: number
  tiers: { level: number; name: string; minXp: number }[]
}

const TIER_ICON = ['🎯', '🥉', '🥈', '🥇', '💎', '👑', '🌟']

export function Vip() {
  const { t } = useTranslation()
  const user = useSession((s) => s.user)
  const [vip, setVip] = useState<VipData | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void api.get<VipData>('/engagement/vip').then(setVip).catch(() => {})
  }, [])

  function copyCode() {
    if (!user?.referralCode) return
    void navigator.clipboard?.writeText(user.referralCode).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!vip) {
    return (
      <div className="mx-auto flex min-h-[40svh] max-w-4xl items-center justify-center text-mist">
        <span className="animate-pulse">{t('common.loading')}</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          ⭐ {t('vip.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('vip.subtitle')}</p>
      </div>

      {/* Current tier + progress */}
      <div className="rounded-3xl border border-violet/30 bg-gradient-to-br from-violet/20 to-magenta/12 p-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{TIER_ICON[vip.level] ?? '⭐'}</span>
            <div>
              <div className="font-display text-2xl font-black text-white">{vip.tierName}</div>
              <div className="text-sm text-lilac">
                {t('vip.level')} {vip.level} · {vip.xp.toLocaleString('en-US')} {t('vip.xp')}
              </div>
            </div>
          </div>
          {vip.rakebackBps > 0 && (
            <div className="text-right">
              <div className="font-display text-xl font-bold text-gold-soft">+{vip.rakebackBps / 100}×</div>
              <div className="text-xs text-white/40">{t('vip.rakeback')}</div>
            </div>
          )}
        </div>

        <div className="mt-6">
          {vip.next ? (
            <>
              <div className="mb-1.5 flex justify-between text-xs text-lilac">
                <span>
                  {t('vip.progressTo')} {vip.next.name}
                </span>
                <span className="font-mono">
                  {vip.xp.toLocaleString('en-US')} / {vip.next.minXp.toLocaleString('en-US')}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-ink/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold to-magenta transition-all"
                  style={{ width: `${Math.round(vip.progress * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-ink/40 px-4 py-3 text-center text-sm font-bold text-gold-soft">
              {t('vip.maxLevel')}
            </div>
          )}
        </div>
      </div>

      {/* All tiers */}
      <h2 className="mb-4 mt-8 font-display text-lg font-bold text-white">{t('vip.tiersTitle')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {vip.tiers.map((tier) => (
          <div
            key={tier.level}
            className={`flex items-center justify-between rounded-2xl border p-4 ${
              tier.level === vip.level
                ? 'border-gold/50 bg-gold/10'
                : tier.level < vip.level
                  ? 'border-white/10 bg-surface opacity-70'
                  : 'border-white/10 bg-surface'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{TIER_ICON[tier.level] ?? '⭐'}</span>
              <div>
                <div className="font-bold text-white">{tier.name}</div>
                <div className="text-xs text-mist">
                  {tier.minXp.toLocaleString('en-US')} {t('vip.xp')}
                </div>
              </div>
            </div>
            {tier.level === vip.level && (
              <span className="rounded-lg bg-gold/20 px-2.5 py-1 text-xs font-bold text-gold-soft">
                {t('vip.current')}
              </span>
            )}
            {tier.level < vip.level && <span className="text-emerald">✓</span>}
          </div>
        ))}
      </div>

      {/* Referral */}
      {user?.referralCode && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('vip.referral')}</h2>
          <p className="mt-1 text-sm text-mist">{t('vip.referralText')}</p>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 rounded-xl border border-white/12 bg-surface-2 px-4 py-3 font-mono text-lg font-bold tracking-widest text-gold-soft">
              {user.referralCode}
            </code>
            <button
              onClick={copyCode}
              className="rounded-xl bg-gradient-to-br from-gold to-magenta px-5 py-3 text-sm font-extrabold text-ink cursor-pointer"
            >
              {copied ? t('vip.copied') : '📋'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
