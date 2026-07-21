import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { SLOTS } from '@/data/slots'
import { SlotCard } from '@/components/slots/SlotCard'
import { GameTabs } from '@/components/slots/GameTabs'
import { filterGames, type GameTab } from '@/lib/filterGames'
import { HeroSlot } from '@/components/home/HeroSlot'
import { WinnersTicker } from '@/components/home/WinnersTicker'
import { Button } from '@/components/ui/Button'
import { useLiveJackpot } from '@/lib/useLiveJackpot'

const FEATURES = [
  { key: 1, icon: '🎁' },
  { key: 2, icon: '🎲' },
  { key: 3, icon: '🃏' },
  { key: 4, icon: '🌐' },
] as const

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

export function Home() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => Boolean(s.currentUserEmail))
  const jackpot = useLiveJackpot()
  const [tab, setTab] = useState<GameTab>('all')

  const registerTo = isAuthenticated ? '/slots' : '/register'
  const filtered = filterGames(SLOTS, tab)

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.02fr_1fr] md:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-magenta/35 bg-magenta/12 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-magenta">
              <span className="h-1.5 w-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--color-magenta)] animate-blink" />
              {t('home.heroKicker')}
            </div>
            <h1 className="mt-5 font-display text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
              {t('home.heroTitle1')}
              <br />
              <span className="text-gradient-gold">{t('home.heroTitle2')}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-lilac sm:text-lg">
              <Trans i18nKey="home.heroSubtitle" components={{ b: <b className="text-gold" /> }} />
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <Link to={registerTo}>
                <Button size="lg">{t('home.ctaBonus')} →</Button>
              </Link>
              <a
                href="#games"
                className="inline-flex items-center rounded-2xl border border-violet/40 bg-violet/12 px-7 py-3.5 text-base font-bold text-violet hover:border-violet/70"
              >
                {t('home.ctaSlots')}
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-8">
              <div>
                <div className="font-display text-2xl font-extrabold text-gold">3000+</div>
                <div className="text-xs text-mist">{t('home.statGames')}</div>
              </div>
              <div>
                <div className="font-display text-2xl font-extrabold text-gold tabular-nums">
                  {fmt(jackpot)}
                </div>
                <div className="text-xs text-mist">{t('home.statJackpot')}</div>
              </div>
              <div>
                <div className="font-display text-2xl font-extrabold text-gold">24/7</div>
                <div className="text-xs text-mist">{t('home.statPayout')}</div>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center">
            <div className="pointer-events-none absolute -left-6 top-0 text-3xl animate-float">🍭</div>
            <div className="pointer-events-none absolute right-0 top-[20%] text-2xl animate-float [animation-delay:0.6s]">
              🍬
            </div>
            <div className="pointer-events-none absolute -left-2 bottom-[10%] text-2xl animate-float [animation-delay:0.3s]">
              🍇
            </div>
            <HeroSlot />
          </div>
        </div>
      </section>

      <WinnersTicker />

      {/* ===== GAMES ===== */}
      <section id="games" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[2px] text-magenta">
              {t('games.kicker')}
            </div>
            <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
              {t('games.title')}
            </h2>
          </div>
          <GameTabs active={tab} onChange={setTab} />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((slot) => (
            <SlotCard key={slot.id} slot={slot} />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="mt-8 text-center text-mist">{t('games.empty')}</p>
        )}
      </section>

      {/* ===== BONUSES ===== */}
      <section id="bonus" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="text-xs font-extrabold uppercase tracking-[2px] text-magenta">
          {t('bonuses.kicker')}
        </div>
        <h2 className="mb-7 mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
          {t('bonuses.title')}
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { n: 1, big: '200%', grad: 'linear-gradient(150deg,#8b3df0,#3a0f6b)' },
            { n: 2, big: '25%', grad: 'linear-gradient(150deg,#FF3D8B,#7a1240)' },
            { n: 3, big: '50', grad: 'linear-gradient(150deg,#FF9D2E,#7a3a08)' },
          ].map((b) => (
            <div
              key={b.n}
              className="relative overflow-hidden rounded-3xl border border-white/14 p-7"
              style={{ background: b.grad }}
            >
              <div className="pointer-events-none absolute -right-3.5 -top-8 font-display text-[120px] font-black text-white/10">
                {b.big}
              </div>
              <div className="relative">
                <span className="inline-block rounded-lg bg-ink/40 px-3 py-1.5 text-xs font-extrabold tracking-wide text-white">
                  {t(`bonuses.b${b.n}Tag`)}
                </span>
                <h3 className="mt-4 font-display text-xl font-extrabold text-white">
                  {t(`bonuses.b${b.n}Title`)}
                </h3>
                <p className="mb-5 mt-2 text-sm leading-relaxed text-white/90">
                  {t(`bonuses.b${b.n}Desc`)}
                </p>
                <Link to={registerTo}>
                  <span className="inline-block rounded-xl bg-ink px-5 py-3 text-sm font-extrabold text-gold">
                    {t('bonuses.activate')}
                  </span>
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-dusk">{t('bonuses.demoNote')}</p>
      </section>

      {/* ===== JACKPOT ===== */}
      <section id="jackpots" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-gold/30 bg-gradient-to-br from-violet/20 to-magenta/16 p-8 text-center sm:p-11">
          <div className="text-xs font-extrabold uppercase tracking-[2px] text-gold">
            {t('jackpots.kicker')}
          </div>
          <div className="my-2 font-display text-5xl font-black tracking-tight text-gradient-gold sm:text-6xl tabular-nums">
            {fmt(jackpot)}
          </div>
          <p className="mx-auto mb-8 max-w-md text-sm text-lilac">{t('jackpots.subtitle')}</p>
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
            {[
              { tier: t('jackpots.tierGrand'), amount: fmt(jackpot), name: 'Mega Money Wheel', color: 'text-gold' },
              { tier: t('jackpots.tierMajor'), amount: '842,550', name: 'Diamond Strike', color: 'text-magenta' },
              { tier: t('jackpots.tierMinor'), amount: '58,900', name: 'Lucky Deluxe', color: 'text-violet' },
            ].map((j) => (
              <div key={j.tier} className="rounded-2xl border border-white/10 bg-ink/50 p-5">
                <div className="text-xs font-bold text-mist">{j.tier}</div>
                <div className={`my-1.5 font-display text-2xl font-extrabold tabular-nums ${j.color}`}>
                  {j.amount}
                </div>
                <div className="text-sm text-lilac">{j.name}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-dusk">{t('jackpots.demoNote')}</p>
        </div>
      </section>

      {/* ===== LIVE CASINO ===== */}
      <section id="live" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-magenta shadow-[0_0_12px_var(--color-magenta)] animate-blink" />
          <div className="text-xs font-extrabold uppercase tracking-[2px] text-magenta">
            {t('live.kicker')}
          </div>
        </div>
        <h2 className="mb-7 mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
          {t('live.title')}
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { key: 1, emoji: '🎡', seats: '6/7', min: 20, live: false },
            { key: 2, emoji: '🃏', seats: '4/7', min: 100, live: true },
            { key: 3, emoji: '🀄', seats: '5/7', min: 50, live: false },
          ].map((l) => (
            <div
              key={l.key}
              className="overflow-hidden rounded-2xl border border-white/8 bg-surface"
            >
              <div
                className="relative flex h-52 items-center justify-center"
                style={{ background: 'linear-gradient(160deg,#2a1550,#0e0724)' }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(200px_140px_at_50%_45%,rgba(168,85,247,0.28),transparent_70%)]" />
                <span className="text-7xl drop-shadow-lg">{l.emoji}</span>
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-magenta px-2.5 py-1 text-[11px] font-extrabold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink" />
                  LIVE
                </span>
                <span className="absolute right-3 top-3 rounded-lg bg-ink/70 px-2.5 py-1 text-xs font-bold text-gold-soft">
                  {l.seats} {t('live.seatsLabel')}
                </span>
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="font-bold">{t(`live.table${l.key}Name`)}</div>
                  <div className="text-xs text-mist">
                    {t('live.minBet')} {l.min}
                  </div>
                </div>
                {l.live ? (
                  <Link to="/blackjack">
                    <Button size="sm">{t('live.playNow')}</Button>
                  </Link>
                ) : (
                  <span className="rounded-xl border border-white/12 px-3.5 py-2 text-xs font-bold text-mist">
                    {t('live.comingSoon')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-dusk">{t('live.demoNote')}</p>
      </section>

      {/* ===== WHY / FEATURES ===== */}
      <section className="border-y border-white/8 bg-surface/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
              {t('home.whyTitle')}
            </h2>
            <p className="mt-2 text-sm text-lilac">{t('home.whyPlaySubtitle')}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.key}
                className="rounded-2xl border border-white/8 bg-surface p-6 transition-colors hover:border-gold/40"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10 text-2xl">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-bold text-white">{t(`home.feature${f.key}Title`)}</h3>
                <p className="text-sm leading-relaxed text-lilac">{t(`home.feature${f.key}Text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PAYMENTS + TRUST ===== */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[2px] text-magenta">
              {t('payments.kicker')}
            </div>
            <h2 className="mb-2 mt-2 font-display text-2xl font-black tracking-tight sm:text-3xl">
              {t('payments.title')}
            </h2>
            <p className="mb-6 max-w-md text-sm text-lilac">{t('payments.subtitle')}</p>
            <div className="grid max-w-lg grid-cols-3 gap-3">
              {['Visa', 'Mastercard', 'Crypto'].map((p) => (
                <div
                  key={p}
                  className="grid h-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-sm font-extrabold text-lilac"
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3.5">
            {[
              { n: 1, icon: '★' },
              { n: 2, icon: 'SSL' },
              { n: 3, icon: '24/7' },
            ].map((tr) => (
              <div
                key={tr.n}
                className="flex items-center gap-3.5 rounded-2xl border border-white/8 bg-white/4 p-4"
              >
                <div className="grid h-11 w-13 flex-none place-items-center rounded-xl bg-gold/14 px-2 text-sm font-black text-gold">
                  {tr.icon}
                </div>
                <div>
                  <div className="font-bold">{t(`payments.trust${tr.n}Title`)}</div>
                  <div className="text-xs text-mist">{t(`payments.trust${tr.n}Sub`)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6">
        <h2 className="mb-7 text-center font-display text-2xl font-black tracking-tight sm:text-3xl">
          {t('reviews.title')}
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { n: 1, grad: 'linear-gradient(135deg,#FFC24B,#FF9D2E)' },
            { n: 2, grad: 'linear-gradient(135deg,#FF3D8B,#A855F7)' },
            { n: 3, grad: 'linear-gradient(135deg,#A855F7,#FF3D8B)' },
          ].map((r) => (
            <div key={r.n} className="rounded-2xl border border-white/8 bg-surface p-6">
              <div className="tracking-[2px] text-gold">★★★★★</div>
              <p className="my-4 text-sm leading-relaxed text-white/85">{t(`reviews.r${r.n}Text`)}</p>
              <div className="flex items-center gap-3">
                <div
                  className="grid h-9 w-9 place-items-center rounded-full font-extrabold text-ink"
                  style={{ background: r.grad }}
                >
                  {t(`reviews.r${r.n}Name`).charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold">{t(`reviews.r${r.n}Name`)}</div>
                  <div className="text-xs text-mist">{t(`reviews.r${r.n}Meta`)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-shift-gradient animate-bg-shift p-10 text-center sm:p-14">
          <h2 className="font-display text-3xl font-black tracking-tight text-ink sm:text-4xl">
            {t('home.finalCtaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base font-semibold text-ink/80">
            {t('home.finalCtaSubtitle')}
          </p>
          <Link to={registerTo} className="mt-6 inline-block">
            <span className="inline-block rounded-2xl bg-ink px-10 py-4 font-display text-lg font-extrabold text-gold shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
              {t('home.finalCtaButton')} →
            </span>
          </Link>
        </div>
      </section>
    </div>
  )
}
