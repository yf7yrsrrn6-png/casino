import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useWalletStore } from '@/store/walletStore'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  uk: 'Українська',
  ru: 'Русский',
  en: 'English',
}

export function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const email = useAuthStore((s) => s.currentUserEmail)
  const changePassword = useAuthStore((s) => s.changePassword)
  const deleteAccount = useAuthStore((s) => s.deleteAccount)
  const removeWallet = useWalletStore((s) => s.removeWallet)
  const { soundEnabled, reducedAnimations, toggleSound, toggleReducedAnimations } =
    useSettingsStore()

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLanguage) || 'uk'

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordMessage({ ok: false, text: t('auth.errorShortPassword') })
      return
    }
    const result = await changePassword(currentPassword, newPassword)
    if (!result.ok) {
      setPasswordMessage({ ok: false, text: t(`auth.${result.error}`) })
      return
    }
    setPasswordMessage({ ok: true, text: t('settings.passwordUpdated') })
    setCurrentPassword('')
    setNewPassword('')
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      window.setTimeout(() => setConfirmingDelete(false), 4000)
      return
    }
    if (email) removeWallet(email)
    deleteAccount()
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {t('settings.title')}
        </h1>
        <p className="mt-2 text-white/50">{t('settings.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Language */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('settings.language')}</h2>
          <p className="mt-1 text-sm text-white/45">{t('settings.languageSubtitle')}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {SUPPORTED_LANGUAGES.map((lng) => (
              <button
                key={lng}
                onClick={() => void i18n.changeLanguage(lng)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                  currentLang === lng
                    ? 'border-gold bg-gold/15 text-gold-soft'
                    : 'border-border text-white/60 hover:text-white'
                }`}
              >
                {LANGUAGE_LABELS[lng]}
              </button>
            ))}
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-semibold text-white">{t('settings.sound')}</h3>
              <p className="text-xs text-white/40">{t('settings.soundSubtitle')}</p>
            </div>
            <Switch checked={soundEnabled} onChange={toggleSound} />
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border py-2 pt-4">
            <div>
              <h3 className="font-semibold text-white">{t('settings.animations')}</h3>
              <p className="text-xs text-white/40">{t('settings.animationsSubtitle')}</p>
            </div>
            <Switch checked={reducedAnimations} onChange={toggleReducedAnimations} />
          </div>
        </section>

        {/* Security */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-white">{t('settings.security')}</h2>
          <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">
                {t('settings.currentPassword')}
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/60">
                {t('settings.newPassword')}
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold/50"
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">{t('settings.deleteAccount')}</h3>
              <p className="max-w-sm text-xs text-white/40">
                {confirmingDelete ? t('settings.deleteConfirm') : t('settings.deleteAccountText')}
              </p>
            </div>
            <Button variant="danger" onClick={handleDelete}>
              {t('settings.deleteAccount')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
