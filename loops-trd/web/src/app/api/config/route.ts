import { route } from "@/server/http";
import { env } from "@/server/env";
import { telegramBotUsername, telegramEnabled } from "@/server/telegram";

export const GET = route(async () => {
  const e = env();
  return {
    chainId: e.CHAIN_ID,
    escrow: e.ESCROW_ADDRESS ?? null,
    usdt: e.USDT_ADDRESS ?? null,
    domain: e.APP_DOMAIN,
    telegram: telegramEnabled() && !!telegramBotUsername(),
    graceMinutes: Number(process.env.CANCEL_GRACE_MINUTES || 15),
  };
});
