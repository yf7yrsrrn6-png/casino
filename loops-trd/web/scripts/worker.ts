/**
 * Постійний воркер кіпера для VPS / Docker / Railway:  npm run worker
 * Кожні KEEPER_INTERVAL_SEC (за замовч. 30 с) викликає keeperTick напряму (без HTTP),
 * тобто індексує події контракту майже в реальному часі й скасовує/заморожує прострочені угоди.
 * Змінні середовища — ті самі, що й для сайту (.env.local).
 */
import { defaultCtx } from "@/server/services/context";
import { keeperTick } from "@/server/services/keeper";
import { flushTelegramOutbox } from "@/server/telegram";

const interval = Math.max(10, Number(process.env.KEEPER_INTERVAL_SEC || 30)) * 1000;
let stopping = false;

async function loop() {
  while (!stopping) {
    const started = Date.now();
    try {
      const ctx = defaultCtx();
      const r = await keeperTick(ctx);
      await flushTelegramOutbox(ctx.db);
      const busy = r.synced || r.indexedDeals || r.cancelledOnChain || r.frozenPaidIntent || r.expiredBeforeDeposit || r.errors.length;
      if (busy) console.log(new Date().toISOString(), JSON.stringify(r));
    } catch (e) {
      console.error(new Date().toISOString(), "keeper failed:", e);
    }
    await new Promise((res) => setTimeout(res, Math.max(1000, interval - (Date.now() - started))));
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
console.log(`Loops Trd keeper worker: кожні ${interval / 1000} с`);
loop().then(() => process.exit(0));
