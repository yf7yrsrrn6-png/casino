import { z } from "zod";
import { authed, rawBody, signedFrom } from "@/server/http";
import { reviewChangeRequest } from "@/server/services/identity";

const schema = z.object({ approve: z.boolean(), note: z.string().max(300).optional() });

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  const b = await rawBody(req);
  await reviewChangeRequest(ctx, actor, params.id, schema.parse(b.input), signedFrom(b));
});
