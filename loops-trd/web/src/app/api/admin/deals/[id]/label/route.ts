import { authed, body } from "@/server/http";
import { labelDispute, labelSchema } from "@/server/services/staff";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  await labelDispute(ctx, actor, params.id, await body(req, labelSchema));
});
