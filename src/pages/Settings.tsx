import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type FairInfo } from '@/lib/api'
import { useSession } from '@/store/useSession'
import { useSettingsStore } from '@/store/settingsStore'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  uk: 'Українська',
  ru: 'Русский',
  en: 'English',
}

interface LimitsRow {
  deposit_limit_daily: number | null
  loss_limit_daily: number | null
  max_bet: number | null
}

export function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const setUser = useSession((s) => s.setUser)
  const logout = useSession((s) => s.logout)
  const { soundEnabled, reducedAnimations, toggleSound, toggleReducedAnimations } =
    useSettingsStore()

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLanguage) || 'uk'

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [maxBet, setMaxBet] = useState('')
  const [lossLimit, setLossLimit] = useState('')
  const [depositLimit, setDepositLimit] = useState('')
  const [limitsMsg, setLimitsMsg] = useState<string | null>(null)

  const [excludeDays, setExcludeDays] = useState('7')
  const [confirmingExclude, setConfirmingExclude] = useState(false)

  const [fair, setFair] = useState<FairInfo | null>(null)
  const [revealedSeed, setRevealedSeed] = useState<string | null>(null)

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    void api
      .get<{ limits: LimitsRow | null }>('/account/profile')
      .then(({ limits }) => {
        if (limits) {
          setMaxBet(limits.max_bet != null ? String(limits.max_bet) : '')
          setLossLimit(limits.loss_limit_daily != null ? String(limits.loss_limit_daily) : '')
          setDepositLimit(limits.deposit_limit_daily != null ? String(limits.deposit_limit_daily) : '')
        }
      })
      .catch(() => {})
    void api.get<FairInfo>('/account/fairness').then(setFair).catch(() => {})
  }, [])

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordMessage({ ok: false, text: t('auth.errorShortPassword') })
      return
    }
    try {
      await api.post('/account/password', { currentPassword, newPassword })
      setPasswordMessage({ ok: true, text: t('settings.passwordUpdated') })
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error'
      setPasswordMessage({
        ok: false,
        text: code === 'invalid_credentials' ? t('auth.errorInvalidCredentials') : t('auth.errorGeneric'),
      })
    }
  }

  function parseLimit(v: string): number | null {
    const n = Number(v)
    return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n)
  }

  async function handleSaveLimits(e: FormEvent) {
    e.preventDefault()
    await api.put('/account/limits', {
      maxBet: parseLimit(maxBet),
      lossLimitDaily: parseLimit(lossLimit),
      depositLimitDaily: parseLimit(depositLimit),
    })
    setLimitsMsg(t('settings.limitsSaved'))
    window.setTimeout(() => setLimitsMsg(null), 2500)
  }

  async function handleSelfExclude() {
    if (!confirmingExclude) {
      setConfirmingExclude(true)
      window.setTimeout(() => setConfirmingExclude(false), 4000)
      return
    }
    const days = Math.max(1, Math.floor(Number(excludeDays) || 1))
    const { selfExcludedUntil } = await api.post<{ selfExcludedUntil: number }>(
      '/account/self-exclude',
      { days },
    )
    if (user) setUser({ ...user, selfExcludedUntil })
    setConfirmingExclude(false)
  }

  async function handleRotateSeed() {
    const { revealed, current } = await api.post<{
      revealed: { serverSeed: string }
      current: FairInfo
    }>('/account/fairness/rotate', {})
    setRevealedSeed(revealed.serverSeed)
    setFair(current)
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault()
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    try {
      await api.post('/account/delete', { password: deletePassword })
      await logout()
      navigate('/')
    } catch {
      setPasswordMessage({ ok: false, text: t('auth.errorInvalidCredentials') })
      setConfirmingDelete(false)
    }
  }

  const excludedActive = user?.selfExcludedUntil && user.selfExcludedUntil > Date.now()

  const inputCls =
    'rounded-xl border border-white/12 bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50 placeholder:text-white/25'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {t('settings.title')}
        </h1>
        <p className="mt-2 text-lilac">{t('settings.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Language */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('settings.language')}</h2>
          <p className="mt-1 text-sm text-mist">{t('settings.languageSubtitle')}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {SUPPORTED_LANGUAGES.map((lng) => (
              <button
                key={lng}
                onClick={() => void i18n.changeLanguage(lng)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                  currentLang === lng
                    ? 'border-gold bg-gold/15 text-gold-soft'
                    : 'border-white/12 text-lilac hover:text-white'
                }`}
              >
                {LANGUAGE_LABELS[lng]}
              </button>
            ))}
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-semibold text-white">{t('settings.sound')}</h3>
              <p className="text-xs text-white/40">{t('settings.soundSubtitle')}</p>
            </div>
            <Switch checked={soundEnabled} onChange={toggleSound} />
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/8 py-2 pt-4">
            <div>
              <h3 className="font-semibold text-white">{t('settings.animations')}</h3>
              <p className="text-xs text-white/40">{t('settings.animationsSubtitle')}</p>
            </div>
            <Switch checked={reducedAnimations} onChange={toggleReducedAnimations} />
          </div>
        </section>

        {/* Play limits */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('settings.limitsTitle')}</h2>
          <p className="mt-1 text-sm text-mist">{t('settings.limitsSubtitle')}</p>
          <form onSubmit={handleSaveLimits} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('settings.maxBet')}</span>
              <input
                type="number"
                min={1}
                value={maxBet}
                onChange={(e) => setMaxBet(e.target.value)}
                placeholder={t('settings.limitPlaceholder')}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('settings.dailyLoss')}</span>
              <input
                type="number"
                min={1}
                value={lossLimit}
                onChange={(e) => setLossLimit(e.target.value)}
                placeholder={t('settings.limitPlaceholder')}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('settings.dailyDeposit')}</span>
              <input
                type="number"
                min={1}
                value={depositLimit}
                onChange={(e) => setDepositLimit(e.target.value)}
                placeholder={t('settings.limitPlaceholder')}
                className={inputCls}
              />
            </label>
            <div className="sm:col-span-3 flex items-center gap-3">
              <Button type="submit" variant="secondary">
                {t('settings.saveLimits')}
              </Button>
              {limitsMsg && <span className="text-sm text-emerald">{limitsMsg}</span>}
            </div>
          </form>
        </section>

        {/* Self-exclusion */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">
            {t('settings.selfExclusionTitle')}
          </h2>
          <p className="mt-1 text-sm text-mist">{t('settings.selfExclusionText')}</p>
          {excludedActive ? (
            <div className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-soft">
              {t('settings.selfExcludedUntil')}:{' '}
              {new Date(user!.selfExcludedUntil!).toLocaleString(i18n.language)}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-white/60">
                  {t('settings.selfExcludeDays')}
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={excludeDays}
                  onChange={(e) => setExcludeDays(e.target.value)}
                  className={`${inputCls} w-28`}
                />
              </label>
              <Button variant={confirmingExclude ? 'danger' : 'secondary'} onClick={handleSelfExclude}>
                {confirmingExclude ? t('settings.selfExcludeConfirm') : t('settings.selfExcludeBtn')}
              </Button>
            </div>
          )}
        </section>

        {/* Provably fair */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">
            {t('settings.fairnessTitle')}
          </h2>
          <p className="mt-1 text-sm text-mist">{t('settings.fairnessText')}</p>
          {fair && (
            <div className="mt-4 flex flex-col gap-2 text-xs">
              <FairRow label={t('settings.serverSeedHash')} value={fair.serverSeedHash} />
              <FairRow label={t('settings.clientSeed')} value={fair.clientSeed} />
              <FairRow label={t('settings.nonce')} value={String(fair.nonce)} />
              {revealedSeed && (
                <FairRow label={t('settings.seedRevealed')} value={revealedSeed} highlight />
              )}
            </div>
          )}
          <Button variant="secondary" className="mt-4" onClick={handleRotateSeed}>
            {t('settings.rotateSeed')}
          </Button>
        </section>

        {/* Security */}
        <section className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('settings.security')}</h2>
          <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">
                {t('settings.currentPassword')}
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">{t('settings.newPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
              />
            </label>
            {passwordMessage && (
              <div
                className={`rounded-xl px-4 py-2.5 text-sm ${
                  passwordMessage.ok
                    ? 'border border-emerald/40 bg-emerald/10 text-emerald'
                    : 'border border-ruby/40 bg-ruby/10 text-ruby'
                }`}
              >
                {passwordMessage.text}
              </div>
            )}
            <Button type="submit" variant="secondary" className="self-start">
              {t('settings.changePassword')}
            </Button>
          </form>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl border border-ruby/30 bg-ruby/5 p-6">
          <h2 className="font-display text-lg font-bold text-ruby">{t('settings.dangerZone')}</h2>
          <p className="mt-1 max-w-lg text-xs text-white/40">{t('settings.deleteAccountText')}</p>
          <form onSubmit={handleDelete} className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={t('settings.deletePasswordPlaceholder')}
              className={`${inputCls} flex-1 min-w-[220px]`}
            />
            <Button type="submit" variant="danger" disabled={!deletePassword}>
              {confirmingDelete ? t('settings.deleteConfirm') : t('settings.deleteAccount')}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}

function FairRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="w-40 shrink-0 font-semibold text-white/50">{label}</span>
      <code
        className={`truncate rounded bg-surface-2 px-2 py-1 font-mono ${
          highlight ? 'text-gold-soft' : 'text-lilac'
        }`}
      >
        {value}
      </code>
    </div>
  )
}
