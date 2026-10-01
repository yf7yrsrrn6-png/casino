import type { LimitTier } from "./config";

export interface Limits {
  single: number;
  daily: number;
  tier: LimitTier;
  nextTier: LimitTier | null;
}

/** Ліміти зростають з кількістю успішних угод. Персональні значення адміна мають пріоритет. */
export function computeLimits(
  tiers: LimitTier[],
  successfulDeals: number,
  overrides: { single?: number | null; daily?: number | null } = {},
): Limits {
  const sorted = [...tiers].sort((a, b) => a.minDeals - b.minDeals);
  let tier = sorted[0];
  for (const t of sorted) if (successfulDeals >= t.minDeals) tier = t;
  const nextTier = sorted.find((t) => t.minDeals > successfulDeals) ?? null;
  return {
    single: overrides.single ?? tier.single,
    daily: overrides.daily ?? tier.daily,
    tier,
    nextTier,
  };
}
