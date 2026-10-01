import { authed } from "@/server/http";
import { getCreateSignature } from "@/server/services/deals";

export const GET = authed({ approved: true, rateLimit: { name: "deal-action", limit: 30, windowSec: 60 } }, async ({ ctx, actor, params }) => getCreateSignature(ctx, actor, params.id));
