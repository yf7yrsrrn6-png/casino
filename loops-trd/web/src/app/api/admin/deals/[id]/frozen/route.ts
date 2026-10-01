import { z } from "zod";
import { authed, rawBody, signedFrom } from "@/server/http";
import { adminDecideFrozen } from "@/server/services/staff";

const schema = z.object({ decision: z.enum(["allow", "cancel"]), note: z.string().trim().min(3).max(500) });

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  const b = await rawBody(req);
  await adminDecideFrozen(ctx, actor, params.id, schema.parse(b.input), signedFrom(b));
});
