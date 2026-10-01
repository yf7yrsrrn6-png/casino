import { authed, body, query } from "@/server/http";
import { createDeal, createDealSchema, dealFilterSchema, listMyDeals } from "@/server/services/deals";

export const GET = authed({}, async ({ req, ctx, actor }) => ({
  deals: await listMyDeals(ctx, actor, dealFilterSchema.parse(query(req))),
}));

export const POST = authed({ approved: true }, async ({ req, ctx, actor, meta }) => ({
  deal: await createDeal(ctx, actor, meta, await body(req, createDealSchema)),
}));
