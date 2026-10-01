import { authed, body, query } from "@/server/http";
import { createOffer, listOffers, offerFilterSchema, offerSchema } from "@/server/services/offers";

export const GET = authed({ approved: true }, async ({ req, ctx, actor }) => ({
  offers: await listOffers(ctx, actor, offerFilterSchema.parse(query(req))),
}));

export const POST = authed({ approved: true, rateLimit: { name: "offer-create", limit: 20, windowSec: 3600 } }, async ({ req, ctx, actor }) => ({
  offer: await createOffer(ctx, actor, await body(req, offerSchema)),
}));
