import { authed, rawBody, signedFrom } from "@/server/http";
import { antifraudOverview, updateAntifraudConfig } from "@/server/services/staff";

export const GET = authed({ roles: ["moderator", "admin"] }, async ({ ctx, actor }) => antifraudOverview(ctx, actor));

export const PUT = authed({ roles: ["admin"] }, async ({ req, ctx, actor }) => {
  const b = await rawBody(req);
  await updateAntifraudConfig(ctx, actor, b.input, signedFrom(b));
});
