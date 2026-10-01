import { authed, body } from "@/server/http";
import { listMessages, messageSchema, postMessage } from "@/server/services/chat";

export const GET = authed({}, async ({ req, ctx, actor, params }) => ({
  messages: await listMessages(ctx, actor, params.id, req.nextUrl.searchParams.get("after") ?? undefined),
}));

export const POST = authed({ approved: true, rateLimit: { name: "chat", limit: 30, windowSec: 60 } }, async ({ req, ctx, actor, params }) => ({
  message: await postMessage(ctx, actor, params.id, await body(req, messageSchema)),
}));
