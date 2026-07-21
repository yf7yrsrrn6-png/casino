import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SLOTS } from '@/data/slots'
import { SlotCard } from '@/components/slots/SlotCard'
import { GameTabs } from '@/components/slots/GameTabs'
import { filterGames, type GameTab } from '@/lib/filterGames'

export function Slots() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<GameTab>('all')
  const filtered = filterGames(SLOTS, tab)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-[2px] text-magenta">
            {t('games.kicker')}
          </div>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
            {t('slots.title')}
          </h1>
          <p className="mt-2 text-lilac">{t('slots.subtitle')}</p>
        </div>
        <GameTabs active={tab} onChange={setTab} />
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((slot) => (
          <SlotCard key={slot.id} slot={slot} />
        ))}
      </div>
      {filtered.length === 0 && <p className="mt-8 text-center text-mist">{t('games.empty')}</p>}
    </div>
  )
}
