import { authed } from "@/server/http";
import { moderationQueue } from "@/server/services/staff";

export const GET = authed({ roles: ["moderator", "admin"] }, async ({ ctx, actor }) => moderationQueue(ctx, actor));
