import { useTranslation } from 'react-i18next'
import type { GameTab } from '@/lib/filterGames'

export function GameTabs({
  active,
  onChange,
}: {
  active: GameTab
  onChange: (tab: GameTab) => void
}) {
  const { t } = useTranslation()
  const tabs: { id: GameTab; label: string }[] = [
    { id: 'all', label: t('games.tabAll') },
    { id: 'slots', label: t('games.tabSlots') },
    { id: 'jackpot', label: t('games.tabJackpot') },
    { id: 'new', label: t('games.tabNew') },
  ]
  return (
    <div className="flex flex-wrap gap-2.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
            active === tab.id
              ? 'bg-gradient-to-br from-gold to-magenta text-ink'
              : 'border border-white/12 bg-white/5 text-lilac hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
