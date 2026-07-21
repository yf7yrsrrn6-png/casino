import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SlotDefinition } from '@/types'
import { ACCENT_TEXT, ACCENT_BORDER_HOVER } from '@/lib/slotTheme'

export function SlotCard({ slot }: { slot: SlotDefinition }) {
  const { t } = useTranslation()
  const words = slot.name.toUpperCase().split(' ')
  const logoSize = words.length >= 3 ? 20 : words.length === 2 ? 26 : 30

  return (
    <Link
      to={`/slots/${slot.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface transition-all duration-200 hover:-translate-y-1.5 ${ACCENT_BORDER_HOVER[slot.accent]} hover:shadow-glow-violet`}
    >
      <div
        className="relative h-44 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${slot.themeFrom}, ${slot.themeTo})` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(140px_110px_at_50%_42%,rgba(255,255,255,0.28),transparent_72%)]" />
        <span className="absolute left-[18px] top-4 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_#fff] animate-sparkle" />
        <span className="absolute right-6 top-[34px] h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_#fff] animate-sparkle [animation-delay:0.5s]" />
        <span className="absolute bottom-11 left-8 h-1 w-1 rounded-full bg-white shadow-[0_0_8px_#fff] animate-sparkle [animation-delay:1s]" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3.5 text-center">
          <span className="text-5xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
            {slot.icon}
          </span>
          <div
            className="font-display font-black uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.55)]"
            style={{ fontSize: logoSize }}
          >
            {words.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <span className="rounded-md border border-white/20 bg-black/40 px-2.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-[1.5px] text-white">
            {slot.tagline}
          </span>
        </div>

        {slot.badge && (
          <span
            className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white ${
              slot.badge === 'new' ? 'bg-emerald' : 'bg-magenta'
            }`}
          >
            {slot.badge === 'new' ? t('games.badgeNew') : t('games.badgeHot')}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-lg bg-ink/70 px-2.5 py-1 text-[11px] font-bold text-gold-soft">
          {t('slots.rtp')} {slot.rtp}%
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <div className="text-xs font-bold text-mist">
          {slot.category === 'jackpot' ? t('games.catJackpot') : t('games.catSlots')} ·{' '}
          <span className={ACCENT_TEXT[slot.accent]}>{slot.provider}</span>
        </div>
        <span className="rounded-lg bg-gradient-to-br from-gold to-magenta px-3.5 py-1.5 text-xs font-extrabold text-ink">
          {t('slots.play')}
        </span>
      </div>
    </Link>
  )
}
