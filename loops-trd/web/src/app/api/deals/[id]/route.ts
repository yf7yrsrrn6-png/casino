import { authed } from "@/server/http";
import { getDealView } from "@/server/services/deals";

export const GET = authed({}, async ({ ctx, actor, params }) => getDealView(ctx, actor, params.id));
