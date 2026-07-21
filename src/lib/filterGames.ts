export type GameTab = 'all' | 'slots' | 'jackpot' | 'new'

export function filterGames<T extends { category: string; badge: unknown }>(
  games: T[],
  active: GameTab,
): T[] {
  if (active === 'all') return games
  if (active === 'new') return games.filter((g) => g.badge === 'new')
  return games.filter((g) => g.category === active)
}
