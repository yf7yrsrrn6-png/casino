import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '@/lib/api'
import { useWallet } from '@/store/useWallet'
import { Button } from '@/components/ui/Button'
import { confettiBurst, playSound } from '@/lib/effects'

interface DailyStatus {
  available: boolean
  amount: number
  nextAt: number
}
interface Achievement {
  id: string
  icon: string
  title: string
  description: string
  unlocked: boolean
}

function promoErrorKey(code?: string): string {
  switch (code) {
    case 'promo_invalid':
      return 'bonusPage.promoInvalid'
    case 'promo_expired':
      return 'bonusPage.promoExpired'
    case 'promo_exhausted':
      return 'bonusPage.promoExhausted'
    case 'promo_already_used':
      return 'bonusPage.promoUsed'
    default:
      return 'auth.errorGeneric'
  }
}

export function Bonuses() {
  const { t } = useTranslation()
  const refreshWallet = useWallet((s) => s.refresh)
  const [daily, setDaily] = useState<DailyStatus | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [countdown, setCountdown] = useState('')
  const [promo, setPromo] = useState('')
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function loadDaily() {
    void api.get<DailyStatus>('/engagement/daily').then(setDaily).catch(() => {})
  }

  useEffect(() => {
    loadDaily()
    void api.get<{ achievements: Achievement[] }>('/engagement/achievements').then(({ achievements: a }) => setAchievements(a)).catch(() => {})
  }, [])

  // Live countdown until the next daily bonus.
  useEffect(() => {
    if (!daily || daily.available) {
      setCountdown('')
      return
    }
    const tick = () => {
      const ms = daily.nextAt - Date.now()
      if (ms <= 0) {
        loadDaily()
        return
      }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      const s = Math.floor((ms % 60_000) / 1000)
      setCountdown(`${h}h ${m}m ${s}s`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [daily])

  async function claimDaily() {
    try {
      await api.post('/engagement/daily/claim')
      confettiBurst(90)
      playSound('win')
      await refreshWallet().catch(() => {})
      loadDaily()
    } catch {
      loadDaily()
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault()
    setPromoMsg(null)
    try {
      const { amount } = await api.post<{ amount: number }>('/engagement/promo', { code: promo })
      setPromoMsg({ ok: true, text: `${t('bonusPage.promoSuccess')}: +${amount.toLocaleString('en-US')}` })
      setPromo('')
      confettiBurst(70)
      playSound('win')
      await refreshWallet().catch(() => {})
    } catch (err) {
      setPromoMsg({ ok: false, text: t(promoErrorKey(err instanceof ApiError ? err.code : undefined)) })
    }
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          🎁 {t('bonusPage.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('bonusPage.subtitle')}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Daily bonus */}
        <div className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/12 to-magenta/10 p-6">
          <div className="text-4xl">📅</div>
          <h2 className="mt-3 font-display text-xl font-bold text-white">{t('bonusPage.dailyTitle')}</h2>
          {daily?.available ? (
            <>
              <p className="mt-1 text-sm text-lilac">{t('bonusPage.dailyReady')}</p>
              <div className="mt-4 font-display text-3xl font-black text-gold-soft">
                +{daily.amount.toLocaleString('en-US')}
              </div>
              <Button className="mt-4" size="lg" onClick={claimDaily}>
                {t('bonusPage.dailyClaim')}
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-lilac">{t('bonusPage.comeBackIn')}</p>
              <div className="mt-4 font-mono text-2xl font-bold text-white/80">{countdown || '—'}</div>
              <Button className="mt-4" size="lg" disabled>
                {t('bonusPage.dailyClaimed')}
              </Button>
            </>
          )}
        </div>

        {/* Promo code */}
        <div className="rounded-3xl border border-white/10 bg-surface p-6">
          <div className="text-4xl">🎟️</div>
          <h2 className="mt-3 font-display text-xl font-bold text-white">{t('bonusPage.promoTitle')}</h2>
          <form onSubmit={redeem} className="mt-4 flex flex-col gap-3">
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder={t('bonusPage.promoPlaceholder')}
              className="rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm uppercase tracking-wide text-white outline-none placeholder:text-white/25 placeholder:normal-case focus:border-gold/50"
            />
            <Button type="submit" disabled={!promo.trim()} className="self-start">
              {t('bonusPage.redeem')}
            </Button>
            {promoMsg && (
              <div className={`text-sm ${promoMsg.ok ? 'text-emerald' : 'text-ruby'}`}>{promoMsg.text}</div>
            )}
          </form>
        </div>
      </div>

      {/* Achievements */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-white">{t('bonusPage.achievementsTitle')}</h2>
        <span className="text-sm text-mist">
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={`rounded-2xl border p-4 text-center ${
              a.unlocked ? 'border-gold/40 bg-gold/10' : 'border-white/8 bg-surface opacity-60'
            }`}
          >
            <div className={`text-3xl ${a.unlocked ? '' : 'grayscale'}`}>{a.icon}</div>
            <div className="mt-2 text-sm font-bold text-white">{t(a.title)}</div>
            <div className="mt-0.5 text-xs text-mist">{t(a.description)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
