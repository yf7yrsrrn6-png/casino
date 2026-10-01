import { authed, body } from "@/server/http";
import { signedSchema, } from "@/server/services/identity";
import { confirmReleaseSignature } from "@/server/services/deals";

export const POST = authed({ approved: true, rateLimit: { name: "release", limit: 20, windowSec: 60 } }, async ({ req, ctx, actor, params }) =>
  confirmReleaseSignature(ctx, actor, params.id, await body(req, signedSchema)),
);
