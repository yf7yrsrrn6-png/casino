import { authed } from "@/server/http";
import { auditLog, dealEventsLog } from "@/server/services/staff";

export const GET = authed({ roles: ["moderator", "admin"] }, async ({ ctx, actor }) => ({
  dealEvents: await dealEventsLog(ctx, actor),
  staffActions: await auditLog(ctx, actor, {}),
}));
