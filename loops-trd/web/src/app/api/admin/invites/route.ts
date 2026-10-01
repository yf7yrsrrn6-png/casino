import { z } from "zod";
import { authed, body } from "@/server/http";
import { createInvite } from "@/server/services/identity";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor }) =>
  createInvite(ctx, actor, await body(req, z.object({ days: z.coerce.number().min(1).max(30), note: z.string().max(200).optional() }))),
);
