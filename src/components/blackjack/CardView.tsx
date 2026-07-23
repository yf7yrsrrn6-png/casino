export interface DisplayCard {
  rank: string
  suit: string
}

const RED_SUITS = new Set(['♥', '♦'])

export function CardView({ card, hidden }: { card?: DisplayCard; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-gold/30 bg-gradient-to-br from-violet/40 to-surface-2 shadow-md sm:h-28 sm:w-20">
        <span className="text-lg font-display font-bold text-gold-soft/50">7</span>
      </div>
    )
  }

  const isRed = RED_SUITS.has(card.suit)

  return (
    <div className="flex h-24 w-16 flex-col justify-between rounded-lg border border-border bg-white p-1.5 shadow-md sm:h-28 sm:w-20 sm:p-2">
      <span className={`text-sm font-bold leading-none sm:text-base ${isRed ? 'text-ruby' : 'text-ink'}`}>
        {card.rank}
      </span>
      <span className={`text-center text-2xl leading-none sm:text-3xl ${isRed ? 'text-ruby' : 'text-ink'}`}>
        {card.suit}
      </span>
      <span
        className={`self-end rotate-180 text-sm font-bold leading-none sm:text-base ${isRed ? 'text-ruby' : 'text-ink'}`}
      >
        {card.rank}
      </span>
    </div>
  )
}
