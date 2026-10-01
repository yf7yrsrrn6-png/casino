import { authed, body } from "@/server/http";
import { completeProfile, profileSchema } from "@/server/services/identity";

export const PUT = authed({}, async ({ req, ctx, actor }) => {
  await completeProfile(ctx, actor, await body(req, profileSchema));
});
