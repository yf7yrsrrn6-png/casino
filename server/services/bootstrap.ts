import { db, now } from '../db/index.ts'

/** Idempotent startup data: ensure a demo welcome promo code exists. */
export function bootstrapData(): void {
  const exists = db.prepare('SELECT 1 FROM promo_codes WHERE code = ?').get('WELCOME')
  if (!exists) {
    db.prepare(
      `INSERT INTO promo_codes (code, amount, max_redemptions, redemptions, expires_at, active, created_at)
       VALUES ('WELCOME', 5000, NULL, 0, NULL, 1, ?)`,
    ).run(now())
    db.prepare(
      `INSERT INTO promo_codes (code, amount, max_redemptions, redemptions, expires_at, active, created_at)
       VALUES ('LUCKY777', 7770, NULL, 0, NULL, 1, ?)`,
    ).run(now())
  }
}
