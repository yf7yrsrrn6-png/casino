import { NextResponse } from "next/server";
import { body, route, setSessionCookie } from "@/server/http";
import { loginSchema, loginWithSiwe } from "@/server/services/identity";
import { signSession } from "@/server/session";

export const POST = route(async ({ req, ctx, meta }) => {
  const input = await body(req, loginSchema);
  const actor = await loginWithSiwe(ctx, input, meta);
  const res = NextResponse.json({ actor });
  setSessionCookie(res, await signSession({ sub: actor.id, wallet: actor.wallet_address }));
  return res;
});
