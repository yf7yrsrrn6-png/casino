/** Tunable economy constants for the demo-credit meta-game. */

export const JACKPOT_SEED = 50000 // pool value after a win / on first init
export const JACKPOT_RAKE_BPS = 100 // 1.00% of every bet feeds the pool
export const JACKPOT_MIN_BET = 25 // bets below this cannot trigger the jackpot
export const JACKPOT_BASE_CHANCE = 1 / 40000 // per eligible bet, scaled by bet size

/** VIP tiers: cumulative XP (= lifetime credits wagered) thresholds. */
export interface VipTier {
  level: number
  name: string
  minXp: number
  rakebackBps: number // share of wagered credits returned via daily bonus scaling
}

export const VIP_TIERS: VipTier[] = [
  { level: 0, name: 'Rookie', minXp: 0, rakebackBps: 0 },
  { level: 1, name: 'Bronze', minXp: 5_000, rakebackBps: 25 },
  { level: 2, name: 'Silver', minXp: 25_000, rakebackBps: 50 },
  { level: 3, name: 'Gold', minXp: 100_000, rakebackBps: 75 },
  { level: 4, name: 'Platinum', minXp: 350_000, rakebackBps: 100 },
  { level: 5, name: 'Diamond', minXp: 1_000_000, rakebackBps: 150 },
  { level: 6, name: 'Elite', minXp: 3_000_000, rakebackBps: 200 },
]

export function tierForXp(xp: number): VipTier {
  let tier = VIP_TIERS[0]
  for (const t of VIP_TIERS) if (xp >= t.minXp) tier = t
  return tier
}

export function nextTier(level: number): VipTier | null {
  return VIP_TIERS.find((t) => t.level === level + 1) ?? null
}

export const DAILY_BONUS_BASE = 500
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000 // 20h so a daily habit never drifts late

export function dailyBonusAmount(level: number): number {
  return DAILY_BONUS_BASE + level * 500
}
