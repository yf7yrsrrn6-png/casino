import { createHash, createHmac, randomBytes } from 'node:crypto'

/**
 * Provably-fair primitives.
 *
 * The server commits to a secret `serverSeed` by publishing its SHA-256 hash
 * before play. Each round's randomness is HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`).
 * After rotating the seed the server reveals the old `serverSeed`, so a player
 * can recompute every outcome and confirm nothing was tampered with.
 */

export function newServerSeed(): { serverSeed: string; serverSeedHash: string } {
  const serverSeed = randomBytes(32).toString('hex')
  const serverSeedHash = createHash('sha256').update(serverSeed).digest('hex')
  return { serverSeed, serverSeedHash }
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

export function newClientSeed(): string {
  return randomBytes(8).toString('hex')
}

/** Deterministic digest for a specific round. */
export function roundDigest(serverSeed: string, clientSeed: string, nonce: number): Buffer {
  return createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest()
}

/**
 * Turns a round digest into an unbounded stream of uniform floats in [0, 1).
 * Consumes 4 bytes per float; re-hashes with an incrementing cursor when the
 * 32-byte digest is exhausted so a single round can drive many draws.
 */
export function floatStream(digest: Buffer): () => number {
  let buffer = digest
  let offset = 0
  let cursor = 0
  return () => {
    if (offset + 4 > buffer.length) {
      buffer = createHmac('sha256', digest).update(String(++cursor)).digest()
      offset = 0
    }
    const int = buffer.readUInt32BE(offset)
    offset += 4
    return int / 0x100000000
  }
}
