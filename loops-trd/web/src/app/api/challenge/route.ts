import { z } from "zod";
import { authed, body } from "@/server/http";
import { createActionChallenge } from "@/server/services/identity";

/** Повідомлення для підпису гаманцем перед критичною дією. Дані дії фіксуються в nonce. */
export const POST = authed({ approved: true, rateLimit: { name: "challenge", limit: 30, windowSec: 60 } }, async ({ req, ctx, actor }) => {
  const { action, payload } = await body(req, z.object({ action: z.string().regex(/^[a-z_.]{3,60}$/), payload: z.unknown() }));
  return createActionChallenge(ctx, actor, action, payload);
});
