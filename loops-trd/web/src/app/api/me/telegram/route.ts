import { authed } from "@/server/http";
import { createLinkCode, telegramEnabled, unlinkTelegram } from "@/server/telegram";
import { HttpError } from "@/server/errors";

/** Посилання для прив'язки Telegram (діє 15 хв). */
export const POST = authed({ approved: true, rateLimit: { name: "tg-link", limit: 10, windowSec: 600 } }, async ({ ctx, actor }) => {
  if (!telegramEnabled()) throw new HttpError(503, "Telegram-бот ще не налаштовано адміністратором", "telegram_disabled");
  return createLinkCode(ctx.db, actor.id);
});

export const DELETE = authed({}, async ({ ctx, actor }) => {
  await unlinkTelegram(ctx.db, actor.id);
});
