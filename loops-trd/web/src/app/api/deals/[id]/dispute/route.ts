import { authed, body } from "@/server/http";
import { disputeSchema, openDispute } from "@/server/services/deals";

export const POST = authed({ approved: true }, async ({ req, ctx, actor, params }) => {
  await openDispute(ctx, actor, params.id, await body(req, disputeSchema));
});
