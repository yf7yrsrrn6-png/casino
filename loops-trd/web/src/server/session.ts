import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const SESSION_COOKIE = "lt_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionClaims {
  sub: string;
  wallet: string;
}

export interface VerifiedSession extends SessionClaims {
  jti: string;
  exp: number;
}

const key = () => new TextEncoder().encode(env().SESSION_SECRET);

/** JWT сумісний із Supabase (role/aud = authenticated, sub = profiles.id). */
export async function signSession(c: SessionClaims): Promise<string> {
  return new SignJWT({ wallet: c.wallet, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(c.sub)
    .setAudience("authenticated")
    .setIssuer("loops-trd")
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "authenticated", issuer: "loops-trd", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.wallet !== "string" || !payload.jti || !payload.exp) return null;
    return { sub: payload.sub, wallet: payload.wallet, jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}
