import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { route } from "@/server/http";
import { env } from "@/server/env";
import { unauthorized } from "@/server/errors";
import { keeperTick } from "@/server/services/keeper";
import { flushTelegramOutbox } from "@/server/telegram";

export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Кіпер: автоскасування, індексатор подій, звірка з контрактом. Викликається pg_cron / GitHub Actions / Vercel Cron. */
const handler = route(async ({ req, ctx }) => {
  if (!authorized(req)) throw unauthorized("Невірний CRON_SECRET");
  const report = await keeperTick(ctx);
  const telegram = await flushTelegramOutbox(ctx.db);
  return { ...report, telegram };
});

export const GET = handler;
export const POST = handler;
