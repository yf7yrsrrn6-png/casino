export interface Card {
  rank: string
  suit: '♠' | '♥' | '♦' | '♣'
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣']

/** Provably-fair shuffled shoe (Fisher-Yates driven by the seeded stream). */
export function buildShoe(deckCount: number, next: () => number): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit })
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export function handValue(cards: Card[]): number {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c.rank === 'A') {
      total += 11
      aces++
    } else if (['J', 'Q', 'K'].includes(c.rank)) {
      total += 10
    } else {
      total += Number(c.rank)
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return total
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards) > 21
}

export function dealerPlays(dealer: Card[], shoe: Card[]): { dealer: Card[]; shoe: Card[] } {
  const hand = [...dealer]
  const rest = [...shoe]
  while (handValue(hand) < 17) {
    hand.push(rest.shift()!)
  }
  return { dealer: hand, shoe: rest }
}

export type BjOutcome = 'player_blackjack' | 'win' | 'lose' | 'push' | 'bust' | 'dealer_bust'

/**
 * Returns the gross amount to return to the player for a resolved hand.
 * Blackjack pays 3:2; a normal win 1:1; push returns the stake; a loss returns 0.
 */
export function settlement(
  player: Card[],
  dealer: Card[],
  bet: number,
  playerNatural: boolean,
): { outcome: BjOutcome; payout: number } {
  if (isBust(player)) return { outcome: 'bust', payout: 0 }

  const dealerNatural = isBlackjack(dealer)
  if (playerNatural) {
    if (dealerNatural) return { outcome: 'push', payout: bet }
    return { outcome: 'player_blackjack', payout: Math.round(bet * 2.5) }
  }
  if (dealerNatural) return { outcome: 'lose', payout: 0 }

  const p = handValue(player)
  const d = handValue(dealer)
  if (d > 21) return { outcome: 'dealer_bust', payout: bet * 2 }
  if (p > d) return { outcome: 'win', payout: bet * 2 }
  if (p < d) return { outcome: 'lose', payout: 0 }
  return { outcome: 'push', payout: bet }
}
