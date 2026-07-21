import { useTranslation } from 'react-i18next'

const ITEMS = [
  { user: 'Oleh K.', amount: '48,200', game: 'Dragon Riches' },
  { user: 'Maria T.', amount: '12,750', game: 'Sweet Fiesta' },
  { user: 'Dmytro V.', amount: '96,400', game: 'Mega Money Wheel' },
  { user: 'Iryna S.', amount: '7,300', game: 'Fruit Rush' },
  { user: 'Andrii P.', amount: '154,000', game: 'Diamond Strike' },
  { user: 'Sofia L.', amount: '23,900', game: 'Lucky Deluxe' },
]

export function WinnersTicker() {
  const { t } = useTranslation()
  const loop = [...ITEMS, ...ITEMS]
  return (
    <div className="overflow-hidden border-y border-white/8 bg-gold/5">
      <div className="flex w-max animate-marquee py-3.5">
        {loop.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap px-8 text-sm font-bold text-lilac"
          >
            <span className="text-gold">▲</span> {item.user} {t('ticker.won')}{' '}
            <b className="text-magenta">{item.amount}</b> {t('ticker.at')} {item.game}
          </div>
        ))}
      </div>
    </div>
  )
}
