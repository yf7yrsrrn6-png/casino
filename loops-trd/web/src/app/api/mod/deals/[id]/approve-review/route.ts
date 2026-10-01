import { z } from "zod";
import { authed, body } from "@/server/http";
import { staffApproveRelease } from "@/server/services/deals";

export const POST = authed({ roles: ["moderator", "admin"] }, async ({ req, ctx, actor, params }) => {
  const { note } = await body(req, z.object({ note: z.string().trim().min(3).max(500) }));
  await staffApproveRelease(ctx, actor, params.id, note);
});
