import { z } from "zod";
import type { Ctx } from "../context";
import { one } from "../../db";
import type { Actor } from "../../auth";
import { conflict, forbidden } from "../../errors";
import { logDealEvent, notify, notifyStaff } from "../../audit";
import { getVisibleDeal } from "./types";
import { syncDeal } from "./sync";

/** Скасування до внесення депозиту (у контракті коштів немає). Після депозиту — лише через контракт. */
export async function cancelBeforeDeposit(ctx: Ctx, actor: Actor, dealId: string) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.buyer_id !== actor.id && d.seller_id !== actor.id) throw forbidden();
  if (d.status !== "awaiting_deposit") throw conflict("Після внесення USDT скасування — через контракт");
  if (ctx.chain.configured) {
    const oc = await ctx.chain.getDeal(d.chain_deal_id);
    if (oc.status !== "None" && oc.status !== "Created") return syncDeal(ctx, d.id, actor);
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query(`update deals set status = 'cancelled', closed_at = now(), updated_at = now() where id = $1 and status = 'awaiting_deposit'`, [d.id]);
    await logDealEvent(tx, d.id, actor, "deal.cancelled");
    const other = actor.id === d.buyer_id ? d.seller_id : d.buyer_id;
    await notify(tx, other, "deal", "Угоду скасовано", null, `/deals/${d.id}`);
  });
}

export const disputeSchema = z.object({ reason: z.string().trim().min(5).max(1000) });

/**
 * Фіксує причину спору. Далі сторона викликає openDispute у контракті, а sync оновлює статус
 * (і лише тоді рахує спір у репутації). Пильнує персонал одразу — ще до транзакції.
 */
export async function openDispute(ctx: Ctx, actor: Actor, dealId: string, input: z.infer<typeof disputeSchema>) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.buyer_id !== actor.id && d.seller_id !== actor.id) throw forbidden("Спір відкриває лише сторона угоди");
  if (!["funded", "paid", "disputed"].includes(d.status)) throw conflict("Спір можливий лише після внесення USDT");
  await ctx.db.transaction(async (tx) => {
    const existing = await one<{ reason: string }>(tx, `select reason from disputes where deal_id = $1`, [d.id]);
    if (existing && !existing.reason.startsWith("Спір відкрито безпосередньо")) throw conflict("Спір уже відкрито");
    await tx.query(
      `insert into disputes (deal_id, opened_by, reason) values ($1, $2, $3)
       on conflict (deal_id) do update set reason = excluded.reason, opened_by = excluded.opened_by`,
      [d.id, actor.id, input.reason],
    );
    await logDealEvent(tx, d.id, actor, "dispute.opened", { reason: input.reason });
    await notifyStaff(tx, "dispute", "Відкрито спір", input.reason.slice(0, 140), `/deals/${d.id}`);
  });
}
