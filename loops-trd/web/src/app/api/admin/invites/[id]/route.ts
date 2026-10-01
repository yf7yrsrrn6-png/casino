import { authed } from "@/server/http";
import { revokeInvite } from "@/server/services/identity";

export const DELETE = authed({ roles: ["admin"] }, async ({ ctx, actor, params }) => {
  await revokeInvite(ctx, actor, params.id);
});
