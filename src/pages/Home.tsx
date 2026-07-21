import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { SLOTS } from '@/data/slots'
import { SlotCard } from '@/components/slots/SlotCard'
import { Button } from '@/components/ui/Button'

const FEATURES = [
  { key: 1, icon: '🎁' },
  { key: 2, icon: '🎲' },
  { key: 3, icon: '🃏' },
  { key: 4, icon: '🌐' },
] as const

export function Home() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => Boolean(s.currentUserEmail))

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-violet/25 blur-[100px]" />
          <div className="absolute -right-24 top-20 h-96 w-96 rounded-full bg-gold/15 blur-[100px]" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-gold-soft">
              ✨ {t('home.heroKicker')}
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/60 sm:text-lg">
              {t('home.heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isAuthenticated ? (
                <Link to="/slots">
                  <Button size="lg">{t('home.ctaPlay')} 🎰</Button>
                </Link>
              ) : (
                <Link to="/register">
                  <Button size="lg">{t('home.ctaRegister')} 🎁</Button>
                </Link>
              )}
              <Link to="/slots">
                <Button variant="secondary" size="lg">
                  {t('home.ctaSlots')}
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                ['12,480', t('home.statPlayers')],
                [String(SLOTS.length), t('home.statSlots')],
                ['96.4%', t('home.statPayout')],
                ['24/7', t('home.statSupport')],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="font-display text-2xl font-bold text-gold-soft">{value}</div>
                  <div className="text-xs text-white/45">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="animate-float">
              <div className="relative flex h-72 w-72 items-center justify-center rounded-full border-2 border-gold/30 bg-gradient-to-br from-surface-2 to-surface shadow-glow-gold sm:h-80 sm:w-80">
                <div className="absolute inset-4 rounded-full border border-dashed border-gold/25" />
                <span className="text-8xl">🎰</span>
              </div>
            </div>
            <div className="absolute -left-4 top-4 rounded-2xl border border-border bg-surface-2/90 px-4 py-3 shadow-glow-violet backdrop-blur sm:-left-8">
              <div className="text-[10px] uppercase tracking-wide text-white/40">
                {t('home.jackpotLabel')}
              </div>
              <div className="font-mono text-lg font-bold text-gold-soft">248,510</div>
            </div>
            <div className="absolute -right-2 bottom-6 rounded-2xl border border-border bg-surface-2/90 px-4 py-3 shadow-glow-violet backdrop-blur sm:-right-6">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald" /> +1,240
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular slots */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {t('home.popularSlots')}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t('home.popularSlotsSubtitle')}</p>
          </div>
          <Link to="/slots" className="shrink-0 text-sm font-semibold text-gold-soft hover:text-gold">
            {t('home.seeAll')} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {SLOTS.slice(0, 4).map((slot) => (
            <SlotCard key={slot.id} slot={slot} />
          ))}
        </div>
      </section>

      {/* Why play */}
      <section className="border-y border-border bg-surface/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {t('home.whyTitle')}
            </h2>
            <p className="mt-2 text-sm text-white/50">{t('home.whyPlaySubtitle')}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.key}
                className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-gold/40"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10 text-2xl">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-bold text-white">{t(`home.feature${f.key}Title`)}</h3>
                <p className="text-sm leading-relaxed text-white/50">
                  {t(`home.feature${f.key}Text`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Games showcase */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 font-display text-2xl font-bold text-white sm:text-3xl">
          {t('home.gamesTitle')}
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Link
            to="/slots"
            className="group relative overflow-hidden rounded-2xl border border-border p-8"
            style={{ background: 'linear-gradient(135deg, #2e2410, #7a5a1e)' }}
          >
            <div className="absolute inset-0 opacity-10 shimmer-bg group-hover:animate-shimmer" />
            <span className="text-5xl">🎰</span>
            <h3 className="mt-4 font-display text-xl font-bold text-white">{t('nav.slots')}</h3>
            <p className="mt-2 max-w-sm text-sm text-white/70">{t('home.popularSlotsSubtitle')}</p>
            <span className="mt-5 inline-block font-semibold text-gold-soft">
              {t('home.ctaSlots')} →
            </span>
          </Link>
          <Link
            to="/blackjack"
            className="group relative overflow-hidden rounded-2xl border border-border p-8 card-felt"
          >
            <div className="absolute inset-0 opacity-10 shimmer-bg group-hover:animate-shimmer" />
            <span className="text-5xl">🃏</span>
            <h3 className="mt-4 font-display text-xl font-bold text-white">
              {t('home.blackjackCardTitle')}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-white/70">{t('home.blackjackCardText')}</p>
            <span className="mt-5 inline-block font-semibold text-emerald">
              {t('home.blackjackCardCta')} →
            </span>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      {!isAuthenticated && (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-surface-2 via-surface-2 to-violet/20 px-6 py-14 text-center">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {t('home.finalCtaTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
              {t('home.finalCtaSubtitle')}
            </p>
            <Link to="/register" className="mt-7 inline-block">
              <Button size="lg">{t('home.ctaRegister')} 🎁</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
