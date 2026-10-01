import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { unauthorized } from "@/server/errors";
import { handleTelegramUpdate, verifyWebhookSecret } from "@/server/telegram";

/** Webhook Telegram. Telegram надсилає X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET. */
export const POST = route(async ({ req, ctx }) => {
  if (!verifyWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) throw unauthorized();
  const update = await req.json().catch(() => ({}));
  await handleTelegramUpdate(ctx.db, update);
  return NextResponse.json({ ok: true });
}, { rateLimit: { name: "tg-webhook", limit: 300, windowSec: 60, by: "ip" } });
