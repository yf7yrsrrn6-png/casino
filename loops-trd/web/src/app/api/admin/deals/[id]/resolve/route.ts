import { authed, body } from "@/server/http";
import { recordResolution, resolveSchema } from "@/server/services/staff";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  await recordResolution(ctx, actor, params.id, await body(req, resolveSchema));
});
