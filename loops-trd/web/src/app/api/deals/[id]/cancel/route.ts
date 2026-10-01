import { authed } from "@/server/http";
import { cancelBeforeDeposit } from "@/server/services/deals";

export const POST = authed({ approved: true }, async ({ ctx, actor, params }) => {
  await cancelBeforeDeposit(ctx, actor, params.id);
});
