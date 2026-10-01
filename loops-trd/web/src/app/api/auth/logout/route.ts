import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { SESSION_COOKIE, verifySession } from "@/server/session";

/** Вихід: токен відкликається на сервері (не лише видаляється cookie). */
export const POST = route(async ({ req, ctx }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const s = token ? await verifySession(token) : null;
  if (s) {
    await ctx.db.query(`insert into revoked_sessions (jti, expires_at) values ($1, to_timestamp($2)) on conflict do nothing`, [s.jti, s.exp]);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
