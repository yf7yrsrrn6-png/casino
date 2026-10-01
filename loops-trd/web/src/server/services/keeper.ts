import type { Hex } from "viem";
import type { Ctx } from "./context";
import { one } from "../db";
import { logDealEvent, logSystem, notify, notifyStaff } from "../audit";
import { syncDeal } from "./deals/sync";
import { systemMessage, type DealRow } from "./deals/types";

/** Скільки блоків назад індексувати при першому запуску та за один крок (обмеження публічних RPC). */
const INITIAL_LOOKBACK = BigInt(process.env.INDEXER_LOOKBACK_BLOCKS || 5000);
const CHUNK = BigInt(process.env.INDEXER_CHUNK_BLOCKS || 2000);
const LOW_GAS = Number(process.env.LOW_GAS_THRESHOLD || 0.02);

export interface KeeperReport {
  expiredBeforeDeposit: number;
  indexedBlocks: number;
  indexedDeals: number;
  synced: number;
  cancelledOnChain: number;
  frozenPaidIntent: number;
  mismatches: number;
  errors: string[];
}

/**
 * Кіпер — запускається за розкладом (Supabase pg_cron / GitHub Actions / Vercel Cron / `npm run worker`).
 * Працює, навіть якщо ніхто не відкрив сайт:
 *  1. скасовує в БД угоди без депозиту понад 30 хв;
 *  2. індексує події контракту з останнього обробленого блоку → синхронізує ці угоди;
 *  3. звіряє ВСІ активні угоди з контрактом (якщо подію пропущено);
 *  4. після дедлайну + пільгового періоду: скасовує (USDT → продавцю) або, якщо покупець уже вказав
 *     оплату, заморожує до рішення адміна (захист покупця, який заплатив, але не встиг натиснути кнопку);
 *  5. перевіряє нещодавно закриті угоди на розбіжність із контрактом;
 *  6. стежить за газом серверного гаманця; прибирає прострочені службові записи.
 */
export async function keeperTick(ctx: Ctx): Promise<KeeperReport> {
  const r: KeeperReport = { expiredBeforeDeposit: 0, indexedBlocks: 0, indexedDeals: 0, synced: 0, cancelledOnChain: 0, frozenPaidIntent: 0, mismatches: 0, errors: [] };
  const fail = async (where: string, e: unknown) => {
    const msg = `${where}: ${(e as Error).message}`;
    r.errors.push(msg);
    await logSystem(ctx.db, "error", "keeper", msg).catch(() => {});
  };

  // 1. Без депозиту понад 30 хв
  const stale = (await ctx.db.query<DealRow>(`select * from deals where status = 'awaiting_deposit' and payment_deadline < $1 and not frozen`, [ctx.now()])).rows;
  for (const d of stale) {
    try {
      const oc = ctx.chain.configured ? await ctx.chain.getDeal(d.chain_deal_id) : null;
      if (oc && oc.status !== "None" && oc.status !== "Created") {
        await syncDeal(ctx, d.id);
        continue;
      }
      await ctx.db.transaction(async (tx) => {
        await tx.query(`update deals set status = 'cancelled', closed_at = now() where id = $1 and status = 'awaiting_deposit'`, [d.id]);
        await logDealEvent(tx, d.id, null, "keeper.auto_cancel", { reason: "Продавець не вніс USDT за 30 хв" });
        await systemMessage(tx, d.id, "Автоскасування: USDT не внесено вчасно.");
        for (const u of [d.buyer_id, d.seller_id]) await notify(tx, u, "deal", "Угоду автоматично скасовано", "USDT не внесено за 30 хв", `/deals/${d.id}`);
      });
      r.expiredBeforeDeposit++;
    } catch (e) {
      await fail(`deposit-timeout ${d.id}`, e);
    }
  }

  if (ctx.chain.configured) {
    // 2. Індексатор подій
    try {
      const { blocks, dealIds } = await indexEvents(ctx);
      r.indexedBlocks = blocks;
      for (const chainId of dealIds) {
        const row = await one<{ id: string }>(ctx.db, `select id from deals where chain_deal_id = $1`, [chainId]);
        if (!row) continue;
        try {
          await syncDeal(ctx, row.id);
          r.indexedDeals++;
        } catch (e) {
          await fail(`index-sync ${row.id}`, e);
        }
      }
    } catch (e) {
      await fail("indexer", e);
    }

    // 3–4. Звірка всіх активних угод + дедлайни
    const active = (await ctx.db.query<DealRow>(`select * from deals where status in ('awaiting_deposit', 'funded', 'paid', 'disputed')`)).rows;
    const chainNow = active.length ? await ctx.chain.blockTime() : 0;
    for (const d0 of active) {
      try {
        const d = await syncDeal(ctx, d0.id);
        r.synced++;
        if (d.status !== "funded" || d.frozen) continue;
        const oc = await ctx.chain.getDeal(d.chain_deal_id);
        if (oc.status !== "Funded" || oc.frozen || chainNow <= oc.paymentDeadline) continue;
        const openDispute = await one(ctx.db, `select 1 from disputes where deal_id = $1 and status <> 'resolved'`, [d.id]);
        if (openDispute) continue;

        if (d.buyer_sender_name) {
          // Покупець повідомив про оплату, але «Я оплатив» у контракті немає — не скасовуємо, а заморожуємо.
          const hash = await ctx.chain.freezeDeal(d.chain_deal_id, "keeper:paid_intent_without_markPaid");
          await ctx.db.transaction(async (tx) => {
            await tx.query(`update deals set frozen = true, updated_at = now() where id = $1`, [d.id]);
            await logDealEvent(tx, d.id, null, "keeper.frozen_paid_intent", {}, hash);
            await systemMessage(tx, d.id, "Час на оплату минув, але покупець повідомив про оплату. Угоду зупинено до рішення адміністратора — кошти в безпеці.");
            await notifyStaff(tx, "risk_freeze", "Покупець вказав оплату, але не встиг підтвердити", `${d.amount_usdt} USDT`, `/deals/${d.id}`);
          });
          r.frozenPaidIntent++;
        } else if (chainNow > oc.cancelAvailableAt) {
          const hash = await ctx.chain.cancel(d.chain_deal_id);
          await logDealEvent(ctx.db, d.id, null, "keeper.auto_cancel", { reason: "Оплату не позначено вчасно" }, hash);
          await syncDeal(ctx, d.id);
          r.cancelledOnChain++;
        }
      } catch (e) {
        await fail(`reconcile ${d0.id}`, e);
      }
    }

    // 5. Нещодавно закриті угоди: чи збігається кінцевий стан із контрактом
    const closed = (
      await ctx.db.query<DealRow>(
        `select * from deals where status in ('released', 'cancelled', 'resolved') and closed_at > $1::timestamptz - interval '3 days'
           and not exists (select 1 from system_events s where s.source = 'reconcile' and s.context->>'dealId' = deals.id::text)`,
        [ctx.now()],
      )
    ).rows;
    const expected = { released: "Released", cancelled: "Cancelled", resolved: "Resolved" } as const;
    for (const d of closed) {
      try {
        const oc = await ctx.chain.getDeal(d.chain_deal_id);
        const want = expected[d.status as keyof typeof expected];
        // Скасування до депозиту існує лише в БД (у контракті None/Created) — це нормально.
        const ok = oc.status === want || (d.status === "cancelled" && (oc.status === "None" || oc.status === "Created"));
        if (!ok) {
          r.mismatches++;
          await logSystem(ctx.db, "error", "reconcile", `Розбіжність: у БД «${d.status}», у контракті «${oc.status}»`, { dealId: d.id });
          await notifyStaff(ctx.db, "reconcile", "Розбіжність БД і контракту", `Угода ${d.id.slice(0, 8)}`, `/deals/${d.id}`, true);
        }
      } catch (e) {
        await fail(`verify ${d.id}`, e);
      }
    }

    // 6. Газ серверного гаманця
    try {
      const { address, balance } = await ctx.chain.signerBalance();
      if (Number(balance) < LOW_GAS) {
        const recent = await one(ctx.db, `select 1 from system_events where source = 'gas' and created_at > now() - interval '12 hours'`);
        if (!recent) {
          await logSystem(ctx.db, "warn", "gas", `Мало tBNB на серверному гаманці: ${balance}`, { address, balance });
          await notifyStaff(ctx.db, "gas", "Закінчується газ серверного гаманця", `${address}: ${balance} tBNB. Поповніть з фаусета.`, "/admin", true);
        }
      }
    } catch (e) {
      await fail("gas", e);
    }
  }

  // Прибирання службових записів (приватність і розмір БД)
  await ctx.db.query(`delete from auth_nonces where expires_at < now() - interval '1 day'`);
  await ctx.db.query(`delete from rate_limits where expires_at < now()`);
  await ctx.db.query(`delete from revoked_sessions where expires_at < now()`);
  await ctx.db.query(`delete from user_ips where last_seen < now() - interval '180 days'`);
  await ctx.db.query(`delete from system_events where created_at < now() - interval '90 days' and level = 'info'`);
  return r;
}

/** Читає події контракту з останнього обробленого блоку (курсор у БД), повертає id угод. */
async function indexEvents(ctx: Ctx): Promise<{ blocks: number; dealIds: Hex[] }> {
  const latest = await ctx.chain.latestBlock();
  const cursor = await one<{ last_block: string }>(ctx.db, `select last_block from chain_cursor where id = 'escrow'`);
  let from = cursor ? BigInt(cursor.last_block) + BigInt(1) : latest > INITIAL_LOOKBACK ? latest - INITIAL_LOOKBACK : BigInt(0);
  const ids = new Set<Hex>();
  let blocks = 0;
  while (from <= latest) {
    const to = from + CHUNK - BigInt(1) < latest ? from + CHUNK - BigInt(1) : latest;
    for (const id of await ctx.chain.dealIdsInBlocks(from, to)) ids.add(id);
    await ctx.db.query(
      `insert into chain_cursor (id, last_block, updated_at) values ('escrow', $1, now())
       on conflict (id) do update set last_block = excluded.last_block, updated_at = now()`,
      [to.toString()],
    );
    blocks += Number(to - from + BigInt(1));
    from = to + BigInt(1);
  }
  return { blocks, dealIds: [...ids] };
}
