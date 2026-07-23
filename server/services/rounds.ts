import { randomUUID } from 'node:crypto'
import { db, now } from '../db/index.ts'

export type GameKind =
  | 'slots'
  | 'blackjack'
  | 'roulette'
  | 'baccarat'
  | 'crash'
  | 'dice'
  | 'plinko'
  | 'keno'

export interface RoundInput {
  userId: string
  game: GameKind
  gameId?: string
  bet: number
  payout: number
  outcome: unknown
  fair?: { serverSeedHash: string; clientSeed: string; nonce: number }
}

export function recordRound(input: RoundInput): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO game_rounds
       (id, user_id, game, game_id, bet, payout, outcome_json, server_seed_hash, client_seed, nonce, created_at)
     VALUES (@id, @user_id, @game, @game_id, @bet, @payout, @outcome_json, @hash, @client_seed, @nonce, @created_at)`,
  ).run({
    id,
    user_id: input.userId,
    game: input.game,
    game_id: input.gameId ?? null,
    bet: input.bet,
    payout: input.payout,
    outcome_json: JSON.stringify(input.outcome),
    hash: input.fair?.serverSeedHash ?? null,
    client_seed: input.fair?.clientSeed ?? null,
    nonce: input.fair?.nonce ?? null,
    created_at: now(),
  })
  return id
}

export function listRounds(userId: string, limit = 50) {
  return db
    .prepare('SELECT * FROM game_rounds WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit)
}

export function favoriteGame(userId: string): string | null {
  const row = db
    .prepare(
      `SELECT game_id, COUNT(*) AS n FROM game_rounds
       WHERE user_id = ? AND game_id IS NOT NULL
       GROUP BY game_id ORDER BY n DESC LIMIT 1`,
    )
    .get(userId) as { game_id: string } | undefined
  return row?.game_id ?? null
}
