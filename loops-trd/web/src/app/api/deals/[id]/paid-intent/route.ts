import { authed, body } from "@/server/http";
import { paidIntent, paidIntentSchema } from "@/server/services/deals";

export const POST = authed({ approved: true }, async ({ req, ctx, actor, meta, params }) =>
  paidIntent(ctx, actor, meta, params.id, await body(req, paidIntentSchema)),
);
