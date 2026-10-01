import { z } from "zod";
import type { Ctx } from "../context";
import { one } from "../../db";
import type { Actor, RequestMeta } from "../../auth";
import { isStaff } from "../../auth";
import { conflict, forbidden, HttpError } from "../../errors";
import { logDealEvent, logStaffAction, notify, notifyStaff } from "../../audit";
import { assessDeal, namesMatch, recordDevice } from "../../antifraud";
import { createActionChallenge, verifyActionSignature } from "../identity";
import { elapsed, getVisibleDeal, loadDeal, type DealRow } from "./types";
import { applyRiskDecision, senderMismatch, syncDeal } from "./sync";

export const paidIntentSchema = z.object({ senderName: z.string().trim().min(3).max(80) });

/** Покупець вказує ім'я відправника перед транзакцією markPaid. Кіпер не скасує таку угоду — заморозить. */
export async function paidIntent(ctx: Ctx, actor: Actor, meta: RequestMeta, dealId: string, input: z.infer<typeof paidIntentSchema>) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.buyer_id !== actor.id) throw forbidden("Лише покупець");
  if (d.status !== "funded") throw conflict("Угода не очікує оплати");
  if (d.frozen) throw new HttpError(423, "Угоду зупинено", "frozen");
  await recordDevice(ctx.db, actor.id, meta, ctx.ipIntel);
  const buyer = await one<{ card_holder_name: string }>(ctx.db, `select card_holder_name from profiles where id = $1`, [actor.id]);
  const mismatch = !namesMatch(buyer?.card_holder_name ?? "", input.senderName);
  await ctx.db.query(`update deals set buyer_sender_name = $2, sender_name_mismatch = sender_name_mismatch or $3 where id = $1`, [
    d.id,
    input.senderName,
    mismatch,
  ]);
  await logDealEvent(ctx.db, d.id, actor, "deal.paid_intent", { senderName: input.senderName, mismatch });
  return { mismatch };
}

export const releaseRequestSchema = z.object({
  /** Продавець підтверджує, що ім'я відправника в банку збігається з верифікованим іменем покупця. */
  senderNameMatches: z.boolean(),
  receivedInBank: z.literal(true, { message: "Підтвердіть, що кошти надійшли в банк" }),
});

export type ReleaseStatus =
  | { status: "approved" }
  | { status: "needs_signature"; nonce: string; message: string }
  | { status: "needs_staff" }
  | { status: "frozen" };

/** Продавець: «кошти в банку» → антифрод → approveRelease у контракті → продавець сам викликає confirmRelease. */
export async function requestRelease(
  ctx: Ctx,
  actor: Actor,
  meta: RequestMeta,
  dealId: string,
  input: z.infer<typeof releaseRequestSchema>,
): Promise<ReleaseStatus> {
  let d = await getVisibleDeal(ctx, actor, dealId);
  if (d.seller_id !== actor.id) throw forbidden("Відпустити кошти може лише продавець");
  d = await syncDeal(ctx, d.id, actor);
  if (d.status !== "funded" && d.status !== "paid") throw conflict("Угода не в стані для відпуску коштів");
  if (d.frozen) return { status: "frozen" };
  if (await one(ctx.db, `select 1 from disputes where deal_id = $1 and status <> 'resolved'`, [d.id])) throw conflict("Відкрито спір");
  await recordDevice(ctx.db, actor.id, meta, ctx.ipIntel);

  if (!input.senderNameMatches && !d.sender_name_mismatch) {
    await ctx.db.query(`update deals set sender_name_mismatch = true where id = $1`, [d.id]);
    d.sender_name_mismatch = true;
    await logDealEvent(ctx.db, d.id, actor, "deal.sender_name_mismatch_reported");
  }
  await logDealEvent(ctx.db, d.id, actor, "deal.release_requested", { senderNameMatches: input.senderNameMatches });

  if (d.release_approved) return { status: "approved" };

  const risk = await assessDeal(ctx.db, ctx, {
    stage: "release",
    dealId: d.id,
    buyerId: d.buyer_id,
    sellerId: d.seller_id,
    amountUsdt: Number(d.amount_usdt),
    actingUserId: actor.id,
    meta,
    timing: { secondsPaidToRelease: elapsed(d.paid_at, ctx.now()) },
    senderNameMismatch: await senderMismatch(ctx.db, d),
  });
  if ((await applyRiskDecision(ctx, d, risk)) === "frozen") return { status: "frozen" };
  d = (await loadDeal(ctx.db, d.id))!;
  if (d.release_check && d.release_check !== "none" && !d.release_check_done) {
    if (d.release_check === "wallet_signature") {
      const ch = await createActionChallenge(ctx, actor, "deal.release_confirm", { dealId: d.id, amountUsdt: d.amount_usdt });
      return { status: "needs_signature", ...ch };
    }
    await notifyStaff(ctx.db, "review", "Потрібна перевірка перед відпуском коштів", `${d.amount_usdt} USDT`, `/deals/${d.id}`);
    return { status: "needs_staff" };
  }
  await approveOnChain(ctx, d, null);
  return { status: "approved" };
}

async function approveOnChain(ctx: Ctx, d: DealRow, by: Actor | null) {
  const oc = await ctx.chain.getDeal(d.chain_deal_id);
  const tx = oc.reviewApproved ? null : await ctx.chain.approveRelease(d.chain_deal_id);
  await ctx.db.query(`update deals set release_approved = true, updated_at = now() where id = $1`, [d.id]);
  await logDealEvent(ctx.db, d.id, by, "antifraud.release_approved", {}, tx);
}

/** Середній ризик: продавець підтверджує відпуск підписом гаманця. */
export async function confirmReleaseSignature(ctx: Ctx, actor: Actor, dealId: string, signed: { nonce?: string; signature?: string }) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.seller_id !== actor.id) throw forbidden("Лише продавець");
  if (d.release_check !== "wallet_signature") throw conflict("Підпис для цієї угоди не потрібен");
  if (d.frozen) throw new HttpError(423, "Угоду зупинено", "frozen");
  const sig = await verifyActionSignature(ctx.db, actor, "deal.release_confirm", { dealId: d.id, amountUsdt: d.amount_usdt }, signed);
  await ctx.db.query(`update deals set release_check_done = true where id = $1`, [d.id]);
  await logDealEvent(ctx.db, d.id, actor, "deal.release_signed", { signature: sig });
  await approveOnChain(ctx, { ...d, release_check_done: true }, actor);
  return { status: "approved" as const };
}

/** Модератор/адмін підтверджує перевірку. Кошти все одно відпускає лише продавець. */
export async function staffApproveRelease(ctx: Ctx, actor: Actor, dealId: string, note: string) {
  if (!isStaff(actor)) throw forbidden();
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.frozen) throw conflict("Заморожену угоду вирішує лише адміністратор");
  if (d.release_check !== "staff" || d.release_check_done) throw conflict("Перевірка персоналом не потрібна");
  if (d.status !== "funded" && d.status !== "paid") throw conflict("Невідповідний статус угоди");
  await ctx.db.query(`update deals set release_check_done = true where id = $1`, [d.id]);
  await logStaffAction(ctx.db, actor, "deal.review_approved", { type: "deal", id: d.id }, { note });
  await logDealEvent(ctx.db, d.id, actor, "staff.review_approved", { note });
  await approveOnChain(ctx, d, actor);
  await notify(ctx.db, d.seller_id, "deal", "Перевірку пройдено", "Можна підтверджувати отримання", `/deals/${d.id}`);
}
