import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SlotDefinition } from '@/types'
import { ACCENT_TEXT, ACCENT_BORDER_HOVER } from '@/lib/slotTheme'

export function SlotCard({ slot }: { slot: SlotDefinition }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/slots/${slot.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-200 hover:-translate-y-1 ${ACCENT_BORDER_HOVER[slot.accent]} hover:shadow-glow-violet`}
    >
      <div
        className="relative flex h-36 items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${slot.themeFrom}, ${slot.themeTo})`,
        }}
      >
        <div className="absolute inset-0 opacity-20 shimmer-bg group-hover:animate-shimmer" />
        <span className="text-6xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
          {slot.icon}
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80 backdrop-blur-sm">
          {t(`slots.volatility${slot.volatility.charAt(0).toUpperCase()}${slot.volatility.slice(1)}`)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base font-bold text-white">{slot.name}</h3>
        <div className="mt-auto flex items-center justify-between text-xs text-white/45">
          <span>
            {t('slots.rtp')}: <span className={ACCENT_TEXT[slot.accent]}>{slot.rtp}%</span>
          </span>
          <span className="font-semibold text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
            {t('slots.play')} →
          </span>
        </div>
      </div>
    </Link>
  )
}
