import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/layout/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_RE.test(email)) {
      setError('errorInvalidEmail')
      return
    }
    if (password.length < 6) {
      setError('errorShortPassword')
      return
    }
    if (password !== confirmPassword) {
      setError('errorPasswordMismatch')
      return
    }

    setSubmitting(true)
    const result = await register(email, password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error ?? 'errorInvalidCredentials')
      return
    }
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-16rem)] max-w-md items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-3xl border border-border bg-surface p-8 shadow-glow-violet">
        <div className="mb-6 text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-white">
            {t('auth.registerTitle')}
          </h1>
          <p className="mt-1 text-sm text-white/50">{t('auth.registerSubtitle')}</p>
        </div>

        <div className="mb-5 rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-gold-soft">
          🎁 {t('auth.welcomeBonus')}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/60">{t('auth.email')}</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold/50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/60">{t('auth.password')}</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 pr-11 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-white/40 hover:text-white/70 cursor-pointer"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/60">{t('auth.confirmPassword')}</span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold/50"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-ruby/40 bg-ruby/10 px-4 py-2.5 text-sm text-ruby">
              {t(`auth.${error}`)}
            </div>
          )}

          <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
            {submitting ? t('common.loading') : t('auth.submitRegister')}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-white/35">
          {t('auth.demoNotice')}
        </p>

        <p className="mt-5 text-center text-sm text-white/50">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-gold-soft hover:text-gold">
            {t('auth.logInLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
