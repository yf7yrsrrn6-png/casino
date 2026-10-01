import { authed, rawBody, signedFrom } from "@/server/http";
import { adminUserAction, userActionSchema } from "@/server/services/identity";

export const POST = authed({ roles: ["admin"] }, async ({ req, ctx, actor, params }) => {
  const b = await rawBody(req);
  await adminUserAction(ctx, actor, params.id, userActionSchema.parse(b.input), signedFrom(b));
});
