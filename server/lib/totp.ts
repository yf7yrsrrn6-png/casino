import { createHmac, randomBytes } from 'node:crypto'

/** RFC 6238 TOTP (SHA-1, 6 digits, 30s step) with base32 secrets — no dependency. */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(buf).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return (code % 1_000_000).toString().padStart(6, '0')
}

/** Verify a 6-digit code allowing ±1 time-step for clock skew. */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const counter = Math.floor(Date.now() / 1000 / 30)
  for (let w = -1; w <= 1; w++) {
    if (hotp(secret, counter + w) === clean) return true
  }
  return false
}

export function otpauthUri(email: string, secret: string, issuer = 'TakeMyLucky'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({ secret, issuer, digits: '6', period: '30', algorithm: 'SHA1' })
  return `otpauth://totp/${label}?${params.toString()}`
}
