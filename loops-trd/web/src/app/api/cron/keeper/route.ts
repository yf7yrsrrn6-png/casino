import { route } from "@/server/http";
import { env } from "@/server/env";
import { unauthorized } from "@/server/errors";
import { keeperTick } from "@/server/services/deals";

/** Автоскасування угод без оплати (30 хв) та синхронізація з контрактом. Викликається Vercel Cron / будь-яким планувальником. */
export const GET = route(async ({ req, ctx }) => {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw unauthorized("Невірний CRON_SECRET");
  return keeperTick(ctx);
});
