export interface PlayingCard {
  rank: string
  suit: '♠' | '♥' | '♦' | '♣'
  id: string
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: PlayingCard['suit'][] = ['♠', '♥', '♦', '♣']

export function createShoe(deckCount = 2): PlayingCard[] {
  const cards: PlayingCard[] = []
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, id: `${rank}${suit}-${d}-${Math.random().toString(36).slice(2)}` })
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export function rankValue(rank: string): number {
  if (rank === 'A') return 11
  if (['J', 'Q', 'K'].includes(rank)) return 10
  return Number(rank)
}

export interface HandValue {
  total: number
  soft: boolean
}

export function handValue(cards: PlayingCard[]): HandValue {
  let total = cards.reduce((sum, c) => sum + rankValue(c.rank), 0)
  let aces = cards.filter((c) => c.rank === 'A').length
  let soft = aces > 0

  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  soft = cards.some((c) => c.rank === 'A') && total <= 21 && aces > 0

  return { total, soft }
}

export function isBlackjack(cards: PlayingCard[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21
}

export function isBust(cards: PlayingCard[]): boolean {
  return handValue(cards).total > 21
}

/** Dealer stands on all 17s (hard or soft). */
export function dealerShouldHit(cards: PlayingCard[]): boolean {
  return handValue(cards).total < 17
}
