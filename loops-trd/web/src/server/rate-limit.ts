import type { Db } from "./db";
import { one } from "./db";
import { HttpError } from "./errors";

export interface RateLimitRule {
  /** Назва правила (частина ключа). */
  name: string;
  limit: number;
  windowSec: number;
  /** Рахувати за користувачем (за замовчуванням) чи за IP. */
  by?: "user" | "ip";
}

/**
 * Обмеження частоти запитів із фіксованим вікном. Стан у Postgres — працює на serverless,
 * де пам'ять процесу не спільна між інстансами. Перевищення → 429 + Retry-After.
 */
export async function enforceRateLimit(db: Db, key: string, limit: number, windowSec: number) {
  const r = await one<{ count: number; retry: number }>(
    db,
    `insert into rate_limits (key, count, expires_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (key) do update set
       count = case when rate_limits.expires_at < now() then 1 else rate_limits.count + 1 end,
       expires_at = case when rate_limits.expires_at < now() then now() + make_interval(secs => $2) else rate_limits.expires_at end
     returning count, ceil(extract(epoch from expires_at - now()))::int as retry`,
    [key, windowSec],
  );
  if (r && r.count > limit) {
    throw new HttpError(429, `Забагато запитів. Спробуйте через ${Math.max(1, r.retry)} с.`, "rate_limited", { retryAfter: Math.max(1, r.retry) });
  }
}
