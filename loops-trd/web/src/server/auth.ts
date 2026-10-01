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

export function requestMeta(req: NextRequest | Request): RequestMeta {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  const chain = xff ? xff.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ip = chain[0] || h.get("x-real-ip") || null;
  const proxyHints: string[] = [];
  if (chain.length > 2) proxyHints.push("довгий ланцюг X-Forwarded-For");
  if (h.get("via")) proxyHints.push("заголовок Via");
  if (h.get("forwarded")?.includes("for=") && chain.length > 1) proxyHints.push("заголовок Forwarded");
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
