import { authed, body } from "@/server/http";
import { offerUpdateSchema, updateOffer } from "@/server/services/offers";

export const PATCH = authed({ approved: true }, async ({ req, ctx, actor, params }) => {
  await updateOffer(ctx, actor, params.id, await body(req, offerUpdateSchema));
});
