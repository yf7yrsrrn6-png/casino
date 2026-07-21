import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <span className="text-6xl">🎲</span>
      <h1 className="mt-4 font-display text-5xl font-extrabold text-gradient-gold">
        {t('notFound.title')}
      </h1>
      <p className="mt-3 text-white/50">{t('notFound.text')}</p>
      <Link to="/" className="mt-6">
        <Button>{t('notFound.cta')}</Button>
      </Link>
    </div>
  )
}
