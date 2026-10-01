import { authed } from "@/server/http";
import { getCreateSignature } from "@/server/services/deals";

export const GET = authed({ approved: true }, async ({ ctx, actor, params }) => getCreateSignature(ctx, actor, params.id));
