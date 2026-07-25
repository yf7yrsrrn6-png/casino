import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SlotDefinition } from '@/types'
import { ACCENT_TEXT, ACCENT_BORDER_HOVER } from '@/lib/slotTheme'
import { SLOT_COVERS } from '@/assets/games/covers'

export function SlotCard({ slot }: { slot: SlotDefinition }) {
  const { t } = useTranslation()
  const cover = SLOT_COVERS[slot.id]

  return (
    <Link
      to={`/slots/${slot.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface transition-all duration-200 hover:-translate-y-1.5 ${ACCENT_BORDER_HOVER[slot.accent]} hover:shadow-glow-violet`}
    >
      <div
        className="relative h-44 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${slot.themeFrom}, ${slot.themeTo})` }}
      >
        {cover && (
          <img
            src={cover}
            alt={slot.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3.5">
          <div className="font-display text-lg font-black uppercase leading-none tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {slot.name}
          </div>
          <span className="w-fit rounded-md border border-white/20 bg-black/40 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[1.5px] text-white/90 backdrop-blur-sm">
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
