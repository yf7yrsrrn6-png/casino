import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export function Layout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-gradient-to-r from-violet/20 via-magenta/15 to-gold/20 py-1.5 text-center text-[11px] font-bold tracking-wide text-white/70">
        {t('common.demoBadge')}
      </div>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
