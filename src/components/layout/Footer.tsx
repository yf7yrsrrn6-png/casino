import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'

export function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-surface/60 mt-20">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-md">
            <Link to="/">
              <Logo />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-dusk">{t('footer.about')}</p>
            <div className="mt-4 flex gap-2.5">
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-lilac">
                {t('footer.demoModeBadge')}
              </span>
              <span className="rounded-lg border border-magenta/35 bg-magenta/15 px-3 py-1.5 text-xs font-extrabold text-magenta">
                {t('footer.ageBadge')}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-12">
            <div>
              <h3 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-dusk">
                {t('nav.slots')}
              </h3>
              <ul className="flex flex-col gap-2.5 text-sm text-lilac">
                <li>
                  <Link to="/slots" className="hover:text-gold-soft">
                    {t('nav.slots')}
                  </Link>
                </li>
                <li>
                  <Link to="/blackjack" className="hover:text-gold-soft">
                    {t('nav.blackjack')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-dusk">
                {t('nav.profile')}
              </h3>
              <ul className="flex flex-col gap-2.5 text-sm text-lilac">
                <li>
                  <Link to="/wallet" className="hover:text-gold-soft">
                    {t('nav.wallet')}
                  </Link>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-gold-soft">
                    {t('nav.settings')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-dusk">
                {t('footer.responsible')}
              </h3>
              <p className="max-w-[16rem] text-sm text-lilac">{t('footer.responsibleText')}</p>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-dusk sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {t('brand.name')}. {t('footer.rights')}
          </span>
          <span>{t('footer.madeFor')}</span>
        </div>
      </div>
    </footer>
  )
}
