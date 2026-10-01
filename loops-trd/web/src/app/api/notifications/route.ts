import { authed } from "@/server/http";
import { listNotifications } from "@/server/services/notifications";

export const GET = authed({}, async ({ ctx, actor }) => listNotifications(ctx, actor));
