import { authed, body } from "@/server/http";
import { recommend, recommendSchema } from "@/server/services/staff";

export const POST = authed({ roles: ["moderator", "admin"] }, async ({ req, ctx, actor, params }) => {
  await recommend(ctx, actor, params.id, await body(req, recommendSchema));
});
