import { authed, rawBody, signedFrom } from "@/server/http";
import { addBlacklist, blacklistSchema } from "@/server/services/staff";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor }) => {
  const b = await rawBody(req);
  await addBlacklist(ctx, actor, blacklistSchema.parse(b.input), signedFrom(b));
});
