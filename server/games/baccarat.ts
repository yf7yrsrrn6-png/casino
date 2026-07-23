import { buildShoe, type Card } from './blackjack.ts'

/** Punto banco baccarat. Card values: A=1, 2-9 pip, 10/J/Q/K=0; hand total mod 10. */
function cardValue(rank: string): number {
  if (rank === 'A') return 1
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 0
  return Number(rank)
}

function total(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardValue(c.rank), 0) % 10
}

export interface BaccaratBets {
  player?: number
  banker?: number
  tie?: number
}

export interface BaccaratResult {
  player: Card[]
  banker: Card[]
  playerTotal: number
  bankerTotal: number
  outcome: 'player' | 'banker' | 'tie'
  totalStake: number
  totalPayout: number
  winning: string[]
}

/** Standard third-card drawing rules. */
export function playBaccarat(bets: BaccaratBets, next: () => number): BaccaratResult {
  const shoe = buildShoe(8, next)
  const player: Card[] = [shoe.shift()!, shoe.shift()!]
  const banker: Card[] = [shoe.shift()!, shoe.shift()!]

  const pNatural = total(player) >= 8
  const bNatural = total(banker) >= 8

  if (!pNatural && !bNatural) {
    let playerThird: number | null = null
    if (total(player) <= 5) {
      const c = shoe.shift()!
      player.push(c)
      playerThird = cardValue(c.rank)
    }

    const bt = total(banker)
    let bankerDraws = false
    if (playerThird === null) {
      bankerDraws = bt <= 5
    } else {
      // Banker third-card table keyed on banker total and the player's third card.
      if (bt <= 2) bankerDraws = true
      else if (bt === 3) bankerDraws = playerThird !== 8
      else if (bt === 4) bankerDraws = playerThird >= 2 && playerThird <= 7
      else if (bt === 5) bankerDraws = playerThird >= 4 && playerThird <= 7
      else if (bt === 6) bankerDraws = playerThird === 6 || playerThird === 7
      else bankerDraws = false
    }
    if (bankerDraws) banker.push(shoe.shift()!)
  }

  const pt = total(player)
  const btf = total(banker)
  const outcome: BaccaratResult['outcome'] = pt > btf ? 'player' : btf > pt ? 'banker' : 'tie'

  const stake = (bets.player ?? 0) + (bets.banker ?? 0) + (bets.tie ?? 0)
  let payout = 0
  const winning: string[] = []

  if (outcome === 'tie') {
    if (bets.tie) {
      payout += bets.tie * 9 // 8:1
      winning.push('tie')
    }
    // Player/banker bets push (returned) on a tie.
    if (bets.player) payout += bets.player
    if (bets.banker) payout += bets.banker
  } else if (outcome === 'player') {
    if (bets.player) {
      payout += bets.player * 2
      winning.push('player')
    }
  } else {
    if (bets.banker) {
      payout += Math.round(bets.banker * 1.95) // 1:1 minus 5% commission
      winning.push('banker')
    }
  }

  return {
    player,
    banker,
    playerTotal: pt,
    bankerTotal: btf,
    outcome,
    totalStake: stake,
    totalPayout: payout,
    winning,
  }
}
