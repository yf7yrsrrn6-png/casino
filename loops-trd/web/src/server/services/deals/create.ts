import { z } from "zod";
import type { Ctx } from "../context";
import { one } from "../../db";
import type { Actor, RequestMeta } from "../../auth";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../../errors";
import { logDealEvent, notify, notifyStaff } from "../../audit";
import { assessDeal, explain, loadConfig, recordDevice, type RiskResult } from "../../antifraud";
import { chainDealId } from "@/lib/chain";
import { toUnits } from "../../chain";
import { amountSchema, DEPOSIT_WINDOW_MIN, getVisibleDeal, systemMessage, uuidSchema, type DealRow } from "./types";

export const createDealSchema = z.object({
  offerId: uuidSchema,
  amountUsdt: amountSchema,
  paymentMethod: z.string().min(2).max(40),
});

/** Причини, які можна показати учаснику (ліміти). Решту правил не розкриваємо. */
function publicBlockReason(r: RiskResult) {
  return r.hardReasons.find((x) => x.includes("ліміт")) ?? "Угоду відхилено системою безпеки. Зверніться до адміністратора.";
}

interface OfferRow {
  id: string;
  user_id: string;
  side: "buy" | "sell";
  price_uah: string;
  min_usdt: string;
  max_usdt: string;
  payment_methods: string[];
  is_active: boolean;
}

/** Відгук на оголошення: перевірки → антифрод → угода в БД (кошти ще не рухаються). */
export async function createDeal(ctx: Ctx, actor: Actor, meta: RequestMeta, input: z.infer<typeof createDealSchema>) {
  if (actor.status !== "approved") throw forbidden("Обліковий запис ще не підтверджено");
  await recordDevice(ctx.db, actor.id, meta, ctx.ipIntel);

  const offer = await one<OfferRow>(ctx.db, `select * from offers where id = $1`, [input.offerId]);
  if (!offer || !offer.is_active) throw notFound("Оголошення недоступне");
  if (offer.user_id === actor.id) throw badRequest("Не можна відгукнутися на власне оголошення");
  if (input.amountUsdt < Number(offer.min_usdt) || input.amountUsdt > Number(offer.max_usdt)) {
    throw badRequest(`Сума має бути від ${offer.min_usdt} до ${offer.max_usdt} USDT`);
  }
  if (!offer.payment_methods.includes(input.paymentMethod)) throw badRequest("Спосіб оплати не підтримується оголошенням");

  const sellerId = offer.side === "sell" ? offer.user_id : actor.id;
  const buyerId = offer.side === "sell" ? actor.id : offer.user_id;
  const parties = (
    await ctx.db.query<{ id: string; wallet_address: string; status: string; profile_completed: boolean }>(
      `select id, wallet_address, status, profile_completed from profiles where id = any($1::uuid[])`,
      [[sellerId, buyerId]],
    )
  ).rows;
  if (parties.length !== 2 || parties.some((p) => p.status !== "approved" || !p.profile_completed)) {
    throw forbidden("Обидві сторони мають бути верифіковані");
  }
  const wallet = (id: string) => parties.find((p) => p.id === id)!.wallet_address;
  const cfg = await loadConfig(ctx.db);
  const price = Number(offer.price_uah);

  // Усе в одній транзакції з блокуванням обох учасників: паралельні запити не обійдуть денний ліміт.
  const result = await ctx.db.transaction(async (tx) => {
    for (const uid of [buyerId, sellerId].sort()) await tx.query("select pg_advisory_xact_lock(hashtext($1::text))", [uid]);

    // Антифрод — до створення угоди. Обійти його неможливо: підпис для контракту видається лише після цього.
    const risk = await assessDeal(tx, ctx, { stage: "create", dealId: null, buyerId, sellerId, amountUsdt: input.amountUsdt, actingUserId: actor.id, meta });
    if (risk.decision === "block") return { kind: "blocked" as const, risk };

    const releaseCheck = risk.level === "low" ? "none" : risk.level === "medium" ? cfg.mediumAction : "staff";
    const id = crypto.randomUUID();
    const deal = await one<DealRow>(
      tx,
      `insert into deals (id, chain_deal_id, offer_id, seller_id, buyer_id, seller_wallet, buyer_wallet, amount_usdt,
         price_uah, total_uah, payment_method, frozen, risk_level, risk_score, release_check, payment_deadline)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning *`,
      [
        id,
        chainDealId(id),
        offer.id,
        sellerId,
        buyerId,
        wallet(sellerId),
        wallet(buyerId),
        input.amountUsdt,
        price,
        Math.round(input.amountUsdt * price * 100) / 100,
        input.paymentMethod,
        risk.decision === "freeze",
        risk.level,
        risk.score,
        releaseCheck,
        new Date(ctx.now().getTime() + DEPOSIT_WINDOW_MIN * 60_000),
      ],
    );
    await tx.query(`update risk_assessments set deal_id = $1 where id = $2`, [id, risk.assessmentId]);
    await logDealEvent(tx, id, actor, "deal.created", { amountUsdt: input.amountUsdt, price, risk: risk.level, score: risk.score });
    await systemMessage(tx, id, "Угоду створено. Продавець має внести USDT в ескроу протягом 30 хв. Підтверджуйте лише після надходження коштів у банк, не за скріншотом.");
    const other = actor.id === sellerId ? buyerId : sellerId;
    await notify(tx, other, "deal", "Нова угода", `${input.amountUsdt} USDT за ${price} ₴`, `/deals/${id}`);
    if (risk.decision === "freeze") {
      await logDealEvent(tx, id, null, "antifraud.frozen", { reasons: explain(risk) });
      await notifyStaff(tx, "risk_freeze", "Угоду зупинено антифродом (високий ризик)", explain(risk).slice(0, 3).join("\n"), `/deals/${id}`);
    }
    return { kind: "ok" as const, deal: deal! };
  });

  if (result.kind === "blocked") {
    await notifyStaff(ctx.db, "risk_block", "Антифрод заблокував угоду", result.risk.hardReasons.join("; "), "/admin/antifraud");
    throw new HttpError(403, publicBlockReason(result.risk), "antifraud_block");
  }
  return result.deal;
}

/** Підпис EIP-712 для createDeal у контракті — лише продавцю, лише для незамороженої угоди. */
export async function getCreateSignature(ctx: Ctx, actor: Actor, dealId: string) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (d.seller_id !== actor.id) throw forbidden("Лише продавець вносить USDT");
  if (d.status !== "awaiting_deposit") throw conflict("Угода вже не очікує депозиту");
  if (d.frozen) throw new HttpError(423, "Угоду зупинено антифродом до рішення адміністратора", "frozen");
  if (d.payment_deadline && new Date(d.payment_deadline) < ctx.now()) throw conflict("Час на внесення депозиту минув");
  if (actor.wallet_address !== d.seller_wallet) throw forbidden("Підключено інший гаманець");
  // reviewRequired = true завжди: кошти відпускаються лише після серверного approveRelease (антифрод).
  const sig = await ctx.chain.signCreateDeal({
    chainDealId: d.chain_deal_id,
    seller: d.seller_wallet,
    buyer: d.buyer_wallet,
    amountUsdt: d.amount_usdt,
    reviewRequired: true,
  });
  await logDealEvent(ctx.db, d.id, actor, "deal.signature_issued", { expiry: sig.expiry });
  return {
    chainDealId: d.chain_deal_id,
    buyer: d.buyer_wallet,
    amount: toUnits(d.amount_usdt).toString(),
    reviewRequired: true,
    expiry: sig.expiry,
    signature: sig.signature,
    escrow: ctx.chain.escrowAddress,
    usdt: ctx.chain.usdtAddress,
  };
}
