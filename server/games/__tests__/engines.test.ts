import { describe, it, expect } from 'vitest'
import { spinSlot, SLOT_CONFIGS, PAYLINES } from '../slots.ts'
import { handValue, settlement, buildShoe, isBlackjack, type Card } from '../blackjack.ts'
import { spinRoulette, colorOf, type RouletteBet } from '../roulette.ts'
import { playBaccarat } from '../baccarat.ts'
import { crashPoint, settleCrash } from '../crash.ts'
import { rollDice, diceMultiplier, winChance } from '../dice.ts'
import { dropPlinko, PLINKO_TABLES, PLINKO_ROWS } from '../plinko.ts'
import { playKeno, KENO_PAYTABLE, KENO_POOL, KENO_DRAWS } from '../keno.ts'
import { roundDigest, floatStream, hashServerSeed, newServerSeed } from '../../lib/provablyFair.ts'

/** Deterministic float generator for tests. */
function seq(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('provably fair', () => {
  it('is deterministic for the same seeds/nonce', () => {
    const a = floatStream(roundDigest('server', 'client', 1))
    const b = floatStream(roundDigest('server', 'client', 1))
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('differs across nonces', () => {
    const a = floatStream(roundDigest('server', 'client', 1))()
    const b = floatStream(roundDigest('server', 'client', 2))()
    expect(a).not.toEqual(b)
  })

  it('produces floats in [0,1)', () => {
    const next = floatStream(roundDigest('s', 'c', 3))
    for (let i = 0; i < 50; i++) {
      const f = next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('commit hash matches revealed seed', () => {
    const { serverSeed, serverSeedHash } = newServerSeed()
    expect(hashServerSeed(serverSeed)).toBe(serverSeedHash)
  })
})

describe('slots', () => {
  it('returns a 3x3 grid and non-negative win', () => {
    const cfg = SLOT_CONFIGS['classic-777']
    const res = spinSlot(cfg, 50, seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]))
    expect(res.grid.length).toBe(3)
    expect(res.grid[0].length).toBe(3)
    expect(res.totalWin).toBeGreaterThanOrEqual(0)
  })

  it('pays out when a payline matches (all-zero roll => first symbol everywhere)', () => {
    const cfg = SLOT_CONFIGS['classic-777']
    const res = spinSlot(cfg, PAYLINES.length * 10, seq([0]))
    // Every cell is the first symbol, so all 5 lines win.
    expect(res.winningLines.length).toBe(PAYLINES.length)
    expect(res.totalWin).toBeGreaterThan(0)
  })

  it('sampled RTP matches the analytical payline expectation', () => {
    const cfg = SLOT_CONFIGS['neon-diamonds']

    // Analytical RTP = Σ (w_i/total)^3 · payout_i  (all three reels show symbol i
    // on a line; the 5 lines and the bet/5 per-line stake cancel out).
    const total = cfg.symbols.reduce((s, sym) => s + sym.weight, 0)
    const expected = cfg.symbols.reduce((s, sym) => s + Math.pow(sym.weight / total, 3) * sym.payout, 0)

    // mulberry32 — a decent uniform PRNG for a stable Monte-Carlo estimate.
    let a = 0x9e3779b9
    const next = () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let x = Math.imul(a ^ (a >>> 15), 1 | a)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }

    let bet = 0
    let win = 0
    for (let i = 0; i < 200000; i++) {
      win += spinSlot(cfg, 100, next).totalWin
      bet += 100
    }
    const rtp = win / bet
    // Sampled RTP should track the analytical value closely.
    expect(Math.abs(rtp - expected) / expected).toBeLessThan(0.12)
  })
})

describe('blackjack', () => {
  it('counts aces softly', () => {
    expect(handValue([{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }])).toBe(21)
    expect(handValue([{ rank: 'A', suit: '♠' }, { rank: 'A', suit: '♥' }])).toBe(12)
    expect(
      handValue([{ rank: 'A', suit: '♠' }, { rank: '9', suit: '♥' }, { rank: '9', suit: '♦' }]),
    ).toBe(19)
  })

  it('blackjack pays 3:2', () => {
    const player: Card[] = [{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }]
    const dealer: Card[] = [{ rank: '9', suit: '♣' }, { rank: '7', suit: '♦' }]
    const s = settlement(player, dealer, 100, isBlackjack(player))
    expect(s.outcome).toBe('player_blackjack')
    expect(s.payout).toBe(250)
  })

  it('bust loses', () => {
    const player: Card[] = [{ rank: 'K', suit: '♠' }, { rank: 'Q', suit: '♥' }, { rank: '5', suit: '♦' }]
    const dealer: Card[] = [{ rank: '9', suit: '♣' }, { rank: '7', suit: '♦' }]
    const s = settlement(player, dealer, 100, false)
    expect(s.outcome).toBe('bust')
    expect(s.payout).toBe(0)
  })

  it('builds a full shoe', () => {
    const shoe = buildShoe(2, seq([0.5]))
    expect(shoe.length).toBe(104)
  })
})

describe('roulette', () => {
  it('colours 0 green', () => {
    expect(colorOf(0)).toBe('green')
    expect(colorOf(1)).toBe('red')
    expect(colorOf(2)).toBe('black')
  })

  it('pays straight 35:1', () => {
    // float 7/37 lands pocket 7.
    const bets: RouletteBet[] = [{ type: 'straight', value: 7, amount: 10 }]
    const res = spinRoulette(bets, seq([7 / 37]))
    expect(res.pocket).toBe(7)
    expect(res.totalPayout).toBe(360) // 10 * 36
  })

  it('red bet loses on black', () => {
    const res = spinRoulette([{ type: 'red', amount: 10 }], seq([2 / 37]))
    expect(res.color).toBe('black')
    expect(res.totalPayout).toBe(0)
  })
})

describe('baccarat', () => {
  it('produces a valid outcome and totals in 0..9', () => {
    const res = playBaccarat({ player: 100 }, seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]))
    expect(['player', 'banker', 'tie']).toContain(res.outcome)
    expect(res.playerTotal).toBeGreaterThanOrEqual(0)
    expect(res.playerTotal).toBeLessThanOrEqual(9)
    expect(res.bankerTotal).toBeLessThanOrEqual(9)
  })
})

describe('crash', () => {
  it('busts instantly below the instant threshold', () => {
    expect(crashPoint(0.005)).toBe(1.0)
  })

  it('has ~1% house edge in expectation', () => {
    let f = 12345
    const next = () => {
      f = (f * 1103515245 + 12345) % 2 ** 31
      return f / 2 ** 31
    }
    const target = 2
    let staked = 0
    let returned = 0
    for (let i = 0; i < 100000; i++) {
      const r = settleCrash(100, target, next())
      staked += 100
      returned += r.payout
    }
    const rtp = returned / staked
    expect(rtp).toBeGreaterThan(0.9)
    expect(rtp).toBeLessThan(1.05)
  })

  it('wins when crash point reaches the target', () => {
    // draw 0.9 => 0.99/0.1 = 9.9x, well above target 2.
    const r = settleCrash(100, 2, 0.9)
    expect(r.won).toBe(true)
    expect(r.payout).toBe(200)
  })
})

describe('dice', () => {
  it('multiplier reflects ~99% RTP', () => {
    // roll under 50: win chance 50%, multiplier ~1.98
    expect(winChance(50, 'under')).toBeCloseTo(0.5)
    expect(diceMultiplier(50, 'under')).toBeCloseTo(1.98, 1)
  })

  it('resolves under/over correctly', () => {
    const under = rollDice(100, 50, 'under', 0.25) // roll 25 < 50 → win
    expect(under.roll).toBe(25)
    expect(under.won).toBe(true)
    const over = rollDice(100, 50, 'over', 0.25) // roll 25 > 50 → lose
    expect(over.won).toBe(false)
    expect(over.payout).toBe(0)
  })

  it('sampled RTP is near the multiplier expectation', () => {
    let f = 7
    const next = () => {
      f = (f * 16807) % 2147483647
      return f / 2147483647
    }
    let bet = 0
    let ret = 0
    for (let i = 0; i < 100000; i++) {
      ret += rollDice(100, 50, 'under', next()).payout
      bet += 100
    }
    expect(ret / bet).toBeGreaterThan(0.9)
    expect(ret / bet).toBeLessThan(1.05)
  })
})

describe('plinko', () => {
  it('all-left path lands in bucket 0 (edge multiplier)', () => {
    const res = dropPlinko(100, 'medium', seq([0])) // every draw < 0.5 → left
    expect(res.bucket).toBe(0)
    expect(res.multiplier).toBe(PLINKO_TABLES.medium[0])
    expect(res.path.length).toBe(PLINKO_ROWS)
  })

  it('all-right path lands in the last bucket', () => {
    const res = dropPlinko(100, 'low', seq([0.9]))
    expect(res.bucket).toBe(PLINKO_ROWS)
  })

  it('RTP is ~98% over many drops', () => {
    let f = 99
    const next = () => {
      f = (f * 16807) % 2147483647
      return f / 2147483647
    }
    let bet = 0
    let ret = 0
    for (let i = 0; i < 200000; i++) {
      ret += dropPlinko(100, 'medium', next).payout
      bet += 100
    }
    expect(ret / bet).toBeGreaterThan(0.9)
    expect(ret / bet).toBeLessThan(1.06)
  })
})

describe('keno', () => {
  it('draws distinct in-range numbers', () => {
    const res = playKeno(100, [1, 2, 3, 4, 5], seq([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8, 0.05]))
    expect(res.drawn.length).toBe(KENO_DRAWS)
    expect(new Set(res.drawn).size).toBe(KENO_DRAWS)
    for (const n of res.drawn) {
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(KENO_POOL)
    }
  })

  it('pays by hit count from the paytable', () => {
    const res = playKeno(100, [1, 2], seq([0.5]))
    expect(res.multiplier).toBe(KENO_PAYTABLE[2][res.hitCount])
    expect(res.payout).toBe(Math.round(100 * res.multiplier))
  })
})
