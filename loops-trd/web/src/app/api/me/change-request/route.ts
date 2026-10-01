import { authed, body } from "@/server/http";
import { changeRequestSchema, requestChange, walletChangeMessage } from "@/server/services/identity";

export const GET = authed({ approved: true }, async ({ req, actor }) => {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  return { message: walletChangeMessage(actor.id, wallet) };
});

export const POST = authed({ approved: true, rateLimit: { name: "change-request", limit: 5, windowSec: 3600 } }, async ({ req, ctx, actor }) => {
  await requestChange(ctx, actor, await body(req, changeRequestSchema));
});
