import { authed, body } from "@/server/http";
import { completeProfile, profileSchema } from "@/server/services/identity";

export const PUT = authed({ rateLimit: { name: "profile", limit: 20, windowSec: 3600 } }, async ({ req, ctx, actor }) => {
  await completeProfile(ctx, actor, await body(req, profileSchema));
});
