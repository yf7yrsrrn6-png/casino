import { authed } from "@/server/http";
import { dashboard } from "@/server/services/staff";

export const GET = authed({ roles: ["admin"] }, async ({ ctx, actor }) => dashboard(ctx, actor));
