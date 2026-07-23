/**
 * Client-side reimplementation of the server's provably-fair stream so a player
 * can independently recompute any past round from the revealed seeds. Must stay
 * byte-for-byte identical to server/lib/provablyFair.ts.
 */

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return new Uint8Array(sig)
}

function readUInt32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] * 0x1000000 + (buf[offset + 1] << 16) + (buf[offset + 2] << 8) + buf[offset + 3]) >>>
    0
  )
}

/** Produce `count` uniform floats in [0,1) matching the server's floatStream. */
export async function makeFloats(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): Promise<number[]> {
  const encoder = new TextEncoder()
  const digest = await hmacSha256(encoder.encode(serverSeed), `${clientSeed}:${nonce}`)

  let buffer = digest
  let offset = 0
  let cursor = 0
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 4 > buffer.length) {
      buffer = await hmacSha256(digest, String(++cursor))
      offset = 0
    }
    out.push(readUInt32BE(buffer, offset) / 0x100000000)
    offset += 4
  }
  return out
}

// ---- Game recomputation ----

export function pickSymbolIndex(weights: number[], roll: number): number {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = roll * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function roulettePocket(float: number): number {
  return Math.floor(float * 37)
}

export function crashPointOf(float: number): number {
  const HOUSE_EDGE = 0.99
  const INSTANT = 0.01
  const MAX = 1000
  if (float < INSTANT) return 1.0
  const raw = HOUSE_EDGE / (1 - float)
  return Math.max(1.0, Math.floor(Math.min(raw, MAX) * 100) / 100)
}
