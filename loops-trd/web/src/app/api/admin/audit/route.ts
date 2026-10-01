import { authed } from "@/server/http";
import { auditLog, dealEventsLog, systemEvents } from "@/server/services/staff";

export const GET = authed({ roles: ["admin"] }, async ({ req, ctx, actor }) => ({
  staffActions: await auditLog(ctx, actor, { actorId: req.nextUrl.searchParams.get("actor") ?? undefined, limit: 500 }),
  dealEvents: await dealEventsLog(ctx, actor, 300),
  system: await systemEvents(ctx, actor),
}));
