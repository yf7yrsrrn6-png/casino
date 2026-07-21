import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-surface/60 mt-20">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-md">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gold bg-surface-2 font-display text-base font-bold text-gold-soft">
                7
              </span>
              <span className="font-display text-lg font-bold text-gradient-gold">
                {t('brand.name')}
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-white/50">{t('footer.about')}</p>
          </div>
          <div className="flex flex-wrap gap-10">
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">
                {t('nav.slots')}
              </h3>
              <ul className="flex flex-col gap-2 text-sm text-white/60">
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
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">
                {t('nav.profile')}
              </h3>
              <ul className="flex flex-col gap-2 text-sm text-white/60">
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
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">
                {t('footer.responsible')}
              </h3>
              <p className="max-w-[16rem] text-sm text-white/50">{t('footer.responsibleText')}</p>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {t('brand.name')}. {t('footer.rights')}
          </span>
          <span>{t('footer.madeFor')}</span>
        </div>
      </div>
    </footer>
  )
}
