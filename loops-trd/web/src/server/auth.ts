import type { NextRequest } from "next/server";
import { getDb, one, type Db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import { forbidden, unauthorized } from "./errors";

export type AppRole = "member" | "moderator" | "admin";
export type VerificationStatus = "pending" | "approved" | "rejected" | "blocked";

export interface Actor {
  id: string;
  wallet_address: string;
  role: AppRole;
  status: VerificationStatus;
  profile_completed: boolean;
  display_name: string | null;
}

export interface RequestMeta {
  ip: string | null;
  deviceHash: string | null;
  userAgent: string | null;
  timezone: string | null;
  /** Ознаки проксі з заголовків (довгий ланцюг X-Forwarded-For, Via тощо). */
  proxyHints: string[];
}

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;

/**
 * IP клієнта з довіреного джерела. Перший запис X-Forwarded-For може підставити сам клієнт,
 * тому беремо:
 *  - TRUSTED_IP_HEADER (напр. `x-real-ip` на Vercel, `cf-connecting-ip` за Cloudflare), якщо задано;
 *  - інакше запис, доданий найближчим довіреним проксі: N-й з кінця X-Forwarded-For (TRUST_PROXY_HOPS, за замовч. 1).
 */
export function clientIp(h: Headers): { ip: string | null; spoofHint: boolean } {
  const trusted = process.env.TRUSTED_IP_HEADER?.toLowerCase();
  const xff = h.get("x-forwarded-for");
  const chain = xff ? xff.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const hops = Math.max(1, Number(process.env.TRUST_PROXY_HOPS || 1));
  let ip: string | null;
  if (trusted) ip = h.get(trusted)?.split(",")[0].trim() || null;
  else ip = chain.length ? chain[Math.max(0, chain.length - hops)] : null;
  if (ip && !IP_RE.test(ip)) ip = null;
  return { ip, spoofHint: chain.length > hops };
}

export function requestMeta(req: NextRequest | Request): RequestMeta {
  const h = req.headers;
  const { ip, spoofHint } = clientIp(h);
  const proxyHints: string[] = [];
  if (spoofHint) proxyHints.push("ланцюг X-Forwarded-For довший за очікуваний (проксі або спроба підміни IP)");
  if (h.get("via")) proxyHints.push("заголовок Via");
  const device = h.get("x-device-id");
  return {
    ip,
    deviceHash: device && /^[a-zA-Z0-9_-]{8,128}$/.test(device) ? device : null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    timezone: h.get("x-timezone")?.slice(0, 64) ?? null,
    proxyHints,
  };
}

export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  return one<Actor>(
    db,
    `select id, wallet_address, role, status, profile_completed, display_name from profiles where id = $1`,
    [userId],
  );
}

/** Повертає актора або null. Роль і статус завжди читаються з БД, а не з токена. */
export async function getActor(req: NextRequest, db: Db = getDb()): Promise<Actor | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  // Сесію відкликано (вихід) — токен більше не діє навіть до закінчення строку.
  if (await one(db, `select 1 from revoked_sessions where jti = $1`, [claims.jti])) return null;
  const actor = await loadActor(db, claims.sub);
  // Зміна гаманця або блокування анулюють сесію.
  if (!actor || actor.wallet_address !== claims.wallet || actor.status === "blocked") return null;
  return actor;
}

export interface RequireOpts {
  approved?: boolean;
  roles?: AppRole[];
}

export function assertActor(actor: Actor | null, opts: RequireOpts = {}): Actor {
  if (!actor) throw unauthorized();
  if ((opts.approved || opts.roles) && actor.status !== "approved") {
    throw forbidden("Обліковий запис ще не підтверджено адміністратором");
  }
  if (opts.roles && !opts.roles.includes(actor.role)) throw forbidden();
  return actor;
}

export async function requireActor(req: NextRequest, opts: RequireOpts = {}, db: Db = getDb()): Promise<Actor> {
  return assertActor(await getActor(req, db), opts);
}

export const isStaff = (a: Actor) => a.status === "approved" && (a.role === "admin" || a.role === "moderator");
export const isAdmin = (a: Actor) => a.status === "approved" && a.role === "admin";
