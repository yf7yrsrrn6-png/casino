import { useState } from 'react'
import { useSession } from '@/store/useSession'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Feedback'

const ERRORS: Record<string, string> = {
  invalid_credentials: 'Невірний email або пароль.',
  email_taken: 'Такий email вже зареєстрований.',
  registration_closed: 'Реєстрація закрита — акаунт уже існує.',
  validation_error: 'Перевірте правильність введених даних.',
  request_failed: 'Сталася помилка. Спробуйте ще раз.',
}

export function Login() {
  const needsSetup = useSession((s) => s.needsSetup)
  const login = useSession((s) => s.login)
  const register = useSession((s) => s.register)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSetup = needsSetup

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = isSetup
      ? await register(email, password, displayName || undefined)
      : await login(email, password)
    if (!res.ok) {
      setError(ERRORS[res.error ?? 'request_failed'] ?? ERRORS.request_failed)
      setBusy(false)
    }
    // On success the session store flips `user`, App re-routes automatically.
  }

  return (
    <div className="grid-bg relative flex min-h-svh items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(600px_260px_at_50%_-40px,var(--accent-soft),transparent_70%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="surface-card rounded-2xl p-6 shadow-lg">
          <h1 className="text-xl font-bold text-text">
            {isSetup ? 'Створення акаунту' : 'Вхід'}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {isSetup
              ? 'Це перший запуск — створіть свій особистий акаунт. Дані зберігаються тільки у вас.'
              : 'Увійдіть, щоб потрапити у свій журнал.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {isSetup && (
              <Field label="Ім'я">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Як до вас звертатися"
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Пароль" hint={isSetup ? 'мінімум 6 символів' : undefined}>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSetup ? 'new-password' : 'current-password'}
              />
            </Field>

            {error && (
              <div className="rounded-xl bg-loss-soft px-3 py-2.5 text-[13px] font-medium text-loss">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Spinner /> : isSetup ? 'Створити акаунт' : 'Увійти'}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-[12px] text-subtle">
          Особистий трейдинг-журнал · дані під паролем
        </p>
      </div>
    </div>
  )
}
