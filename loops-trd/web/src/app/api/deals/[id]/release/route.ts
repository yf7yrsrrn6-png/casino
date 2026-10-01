import { authed, body } from "@/server/http";
import { releaseRequestSchema, requestRelease } from "@/server/services/deals";

export const POST = authed({ approved: true }, async ({ req, ctx, actor, meta, params }) =>
  requestRelease(ctx, actor, meta, params.id, await body(req, releaseRequestSchema)),
);
