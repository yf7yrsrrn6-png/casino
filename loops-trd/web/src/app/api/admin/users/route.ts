import { authed } from "@/server/http";
import { listUsers } from "@/server/services/staff";

export const GET = authed({ roles: ["moderator", "admin"] }, async ({ req, ctx, actor }) =>
  listUsers(ctx, actor, req.nextUrl.searchParams.get("status") ?? undefined),
);
