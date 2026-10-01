import { authed, rawBody, signedFrom } from "@/server/http";
import { removeBlacklist } from "@/server/services/staff";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  await removeBlacklist(ctx, actor, params.id, signedFrom(await rawBody(req)));
});
