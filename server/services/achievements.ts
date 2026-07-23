import { db, now } from '../db/index.ts'
import { notify } from './notifications.ts'

export interface AchievementDef {
  id: string
  icon: string
  title: string
  description: string
}

/** Catalog of unlockable achievements (titles are i18n keys resolved on the client). */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_spin', icon: '🎰', title: 'ach.firstSpin', description: 'ach.firstSpinDesc' },
  { id: 'first_win', icon: '🎉', title: 'ach.firstWin', description: 'ach.firstWinDesc' },
  { id: 'big_win', icon: '🔥', title: 'ach.bigWin', description: 'ach.bigWinDesc' },
  { id: 'high_roller', icon: '💰', title: 'ach.highRoller', description: 'ach.highRollerDesc' },
  { id: 'blackjack_natural', icon: '🃏', title: 'ach.blackjack', description: 'ach.blackjackDesc' },
  { id: 'jackpot_winner', icon: '👑', title: 'ach.jackpot', description: 'ach.jackpotDesc' },
  { id: 'vip_bronze', icon: '🥉', title: 'ach.vipBronze', description: 'ach.vipBronzeDesc' },
  { id: 'vip_gold', icon: '🥇', title: 'ach.vipGold', description: 'ach.vipGoldDesc' },
  { id: 'century', icon: '💯', title: 'ach.century', description: 'ach.centuryDesc' },
]

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function unlocked(userId: string): { id: string; unlocked_at: number }[] {
  return db
    .prepare('SELECT achievement_id AS id, unlocked_at FROM user_achievements WHERE user_id = ?')
    .all(userId) as { id: string; unlocked_at: number }[]
}

/** Idempotently award an achievement; notifies on first unlock. Returns true if newly awarded. */
export function award(userId: string, id: string): boolean {
  const def = BY_ID.get(id)
  if (!def) return false
  const res = db
    .prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)')
    .run(userId, id, now())
  if (res.changes > 0) {
    notify(userId, 'achievement', 'notif.achievementTitle', def.id)
    return true
  }
  return false
}
