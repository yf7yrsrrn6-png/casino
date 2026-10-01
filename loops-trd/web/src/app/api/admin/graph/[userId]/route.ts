import { authed } from "@/server/http";
import { graphFor } from "@/server/services/staff";

export const GET = authed({ roles: ["moderator", "admin"] }, async ({ ctx, actor, params }) => graphFor(ctx, actor, params.userId));
