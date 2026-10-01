import { authed } from "@/server/http";
import { markAllRead } from "@/server/services/notifications";

export const POST = authed({}, async ({ ctx, actor }) => markAllRead(ctx, actor));
