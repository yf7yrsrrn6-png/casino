import { db, now } from '../db/index.ts'
import { newServerSeed, newClientSeed, roundDigest, floatStream } from '../lib/provablyFair.ts'

export interface FairSeedRow {
  user_id: string
  server_seed: string
  server_seed_hash: string
  client_seed: string
  nonce: number
  active: number
  created_at: number
}

const selectActive = db.prepare('SELECT * FROM fair_seeds WHERE user_id = ? AND active = 1')

export function ensureActiveSeed(userId: string): FairSeedRow {
  let seed = selectActive.get(userId) as FairSeedRow | undefined
  if (!seed) {
    const { serverSeed, serverSeedHash } = newServerSeed()
    db.prepare(
      `INSERT INTO fair_seeds (user_id, server_seed, server_seed_hash, client_seed, nonce, active, created_at)
       VALUES (?, ?, ?, ?, 0, 1, ?)`,
    ).run(userId, serverSeed, serverSeedHash, newClientSeed(), now())
    seed = selectActive.get(userId) as FairSeedRow
  }
  return seed
}

/**
 * Consume the next nonce for a round and return a seeded float generator.
 * The digest is deterministic from (serverSeed, clientSeed, nonce), so the
 * player can reproduce it once the server seed is revealed.
 */
export function nextRandom(userId: string): {
  next: () => number
  meta: { serverSeedHash: string; clientSeed: string; nonce: number; serverSeed: string }
} {
  const seed = ensureActiveSeed(userId)
  const nonce = seed.nonce + 1
  db.prepare('UPDATE fair_seeds SET nonce = ? WHERE user_id = ? AND active = 1').run(nonce, userId)
  const digest = roundDigest(seed.server_seed, seed.client_seed, nonce)
  return {
    next: floatStream(digest),
    meta: {
      serverSeedHash: seed.server_seed_hash,
      clientSeed: seed.client_seed,
      nonce,
      serverSeed: seed.server_seed,
    },
  }
}

/** Rotate seeds: reveal the current server seed and commit to a fresh one. */
export function rotateSeed(userId: string, clientSeed?: string): { revealed: FairSeedRow; next: FairSeedRow } {
  const current = ensureActiveSeed(userId)
  db.prepare('UPDATE fair_seeds SET active = 0 WHERE user_id = ? AND active = 1').run(userId)
  const { serverSeed, serverSeedHash } = newServerSeed()
  db.prepare(
    `INSERT INTO fair_seeds (user_id, server_seed, server_seed_hash, client_seed, nonce, active, created_at)
     VALUES (?, ?, ?, ?, 0, 1, ?)`,
  ).run(userId, serverSeed, serverSeedHash, clientSeed?.slice(0, 64) || newClientSeed(), now())
  return { revealed: current, next: selectActive.get(userId) as FairSeedRow }
}

/** Public fairness info (never leaks the active server seed, only its hash). */
export function publicSeedInfo(userId: string) {
  const seed = ensureActiveSeed(userId)
  return {
    serverSeedHash: seed.server_seed_hash,
    clientSeed: seed.client_seed,
    nonce: seed.nonce,
  }
}
