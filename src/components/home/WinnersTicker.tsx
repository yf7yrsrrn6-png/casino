import { useTranslation } from 'react-i18next'
import { useRealtime } from '@/store/useRealtime'

const SEED = [
  { user: 'Oleh K.', amount: 48200, game: 'pirates-gold' },
  { user: 'Maria T.', amount: 12750, game: 'fruit-fiesta' },
  { user: 'Dmytro V.', amount: 96400, game: 'crash' },
  { user: 'Iryna S.', amount: 7300, game: 'roulette' },
  { user: 'Andrii P.', amount: 154000, game: 'neon-diamonds' },
  { user: 'Sofia L.', amount: 23900, game: 'blackjack' },
]

export function WinnersTicker() {
  const { t } = useTranslation()
  const liveWins = useRealtime((s) => s.wins)

  // Prefer live server wins; pad with seed data so the band always looks busy.
  const items = [
    ...liveWins.map((w) => ({ user: w.user, amount: w.amount, game: w.game })),
    ...SEED,
  ].slice(0, 12)
  const loop = [...items, ...items]

  return (
    <div className="overflow-hidden border-y border-white/8 bg-gold/5">
      <div className="flex w-max animate-marquee py-3.5">
        {loop.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap px-8 text-sm font-bold text-lilac"
          >
            <span className="text-gold">▲</span> {item.user} {t('ticker.won')}{' '}
            <b className="text-magenta">{item.amount.toLocaleString('en-US')}</b> {t('ticker.at')}{' '}
            {item.game}
          </div>
        ))}
      </div>
    </div>
  )
}
