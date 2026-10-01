import type { Hex } from "viem";
import type { Ctx } from "../context";
import { one, type Db } from "../../db";
import type { Actor } from "../../auth";
import { notFound } from "../../errors";
import { logDealEvent, logSystem, notify, notifyStaff } from "../../audit";
import { assessDeal, explain, loadConfig, namesMatch, type RiskResult } from "../../antifraud";
import { toUnits, type OnchainDeal } from "../../chain";
import { elapsed, loadDeal, lockDeal, systemMessage, type DealRow, type DealStatus } from "./types";

const STATUS_FROM_CHAIN: Record<Exclude<OnchainDeal["status"], "None">, DealStatus> = {
  Created: "awaiting_deposit",
  Funded: "funded",
  Paid: "paid",
  Released: "released",
  Cancelled: "cancelled",
  Disputed: "disputed",
  Resolved: "resolved",
};

/**
 * Синхронізація угоди з контрактом. Джерело правди — блокчейн: статус у БД змінюється лише
 * відповідно до стану в контракті. Ідемпотентна; викликається клієнтом після транзакції,
 * індексатором подій і періодичною звіркою кіпера.
 */
export async function syncDeal(ctx: Ctx, dealId: string, actor: Actor | null = null): Promise<DealRow> {
  const row = await one<{ chain_deal_id: Hex }>(ctx.db, `select chain_deal_id from deals where id = $1`, [dealId]);
  if (!row) throw notFound();
  const onchain = await ctx.chain.getDeal(row.chain_deal_id);
  const postPaid = { run: false };
  const updated = await ctx.db.transaction(async (tx) => {
    const d = (await lockDeal(tx, dealId))!;
    await applyOnchain(ctx, tx, d, onchain, actor, postPaid);
    return (await loadDeal(tx, dealId))!;
  });
  // Оцінка після «Я оплатив» — поза транзакцією (може надсилати транзакцію freezeDeal).
  if (postPaid.run) await afterPaid(ctx, updated);
  return (await loadDeal(ctx.db, dealId))!;
}

async function applyOnchain(ctx: Ctx, tx: Db, d: DealRow, oc: OnchainDeal, actor: Actor | null, postPaid: { run: boolean }) {
  if (oc.status === "None") return;
  if (oc.seller !== d.seller_wallet || oc.buyer !== d.buyer_wallet || oc.amount !== toUnits(d.amount_usdt)) {
    await logDealEvent(tx, d.id, null, "chain.mismatch", { onchain: { seller: oc.seller, buyer: oc.buyer, amount: oc.amount.toString() } });
    await logSystem(tx, "error", "sync", "Параметри угоди в контракті не збігаються з БД", { dealId: d.id });
    return;
  }
  const ev = (action: string, details: Record<string, unknown> = {}) => logDealEvent(tx, d.id, actor, action, details);
  const sys = (body: string) => systemMessage(tx, d.id, body);

  if (oc.frozen !== d.frozen) {
    await tx.query(`update deals set frozen = $2, updated_at = now() where id = $1`, [d.id, oc.frozen]);
    await ev(oc.frozen ? "chain.frozen" : "chain.unfrozen");
  }
  if (oc.reviewApproved && !d.release_approved) {
    await tx.query(`update deals set release_approved = true where id = $1`, [d.id]);
  }

  const target = STATUS_FROM_CHAIN[oc.status];
  if (target === d.status) {
    if (target === "funded" && oc.paymentDeadline) {
      await tx.query(`update deals set payment_deadline = to_timestamp($2) where id = $1`, [d.id, oc.paymentDeadline]);
    }
    return;
  }

  // Кінцевий стан у БД, а в контракті інший — так бути не повинно. Фіксуємо тривогу, але не «відкочуємо».
  if (["released", "cancelled", "resolved"].includes(d.status)) {
    await logSystem(tx, "error", "reconcile", `Розбіжність: у БД «${d.status}», у контракті «${oc.status}»`, { dealId: d.id });
    await notifyStaff(tx, "reconcile", "Розбіжність БД і контракту", `Угода ${d.id.slice(0, 8)}: БД ${d.status}, контракт ${oc.status}`, `/deals/${d.id}`, true);
    return;
  }

  switch (target) {
    case "funded":
      await tx.query(
        `update deals set status = 'funded', funded_at = to_timestamp($2), payment_deadline = to_timestamp($3), updated_at = now() where id = $1`,
        [d.id, oc.fundedAt, oc.paymentDeadline],
      );
      await ev("chain.funded", { paymentDeadline: oc.paymentDeadline });
      await sys("Продавець вніс USDT в ескроу. Покупець, оплатіть гривнею протягом 30 хв і натисніть «Я оплатив».");
      await notify(tx, d.buyer_id, "deal", "USDT в ескроу — можна оплачувати", `${d.total_uah} ₴ протягом 30 хв`, `/deals/${d.id}`);
      break;
    case "paid":
      await tx.query(`update deals set status = 'paid', paid_at = to_timestamp($2), updated_at = now() where id = $1`, [d.id, oc.paidAt]);
      await ev("chain.paid");
      await sys("Покупець позначив оплату. Продавець: перевірте надходження у банківському застосунку. Не підтверджуйте за скріншотом!");
      await notify(tx, d.seller_id, "deal", "Покупець позначив оплату", "Перевірте надходження в банку", `/deals/${d.id}`);
      postPaid.run = true;
      break;
    case "released":
      await tx.query(`update deals set status = 'released', closed_at = now(), updated_at = now() where id = $1`, [d.id]);
      await tx.query(`update profiles set successful_deals = successful_deals + 1 where id = any($1::uuid[])`, [[d.buyer_id, d.seller_id]]);
      await ev("chain.released");
      await sys("Угоду завершено: USDT відправлено покупцю.");
      await notify(tx, d.buyer_id, "deal", "USDT отримано", `${d.amount_usdt} USDT`, `/deals/${d.id}`);
      await redactChat(tx, d.id);
      break;
    case "cancelled":
      await tx.query(`update deals set status = 'cancelled', closed_at = now(), updated_at = now() where id = $1`, [d.id]);
      await ev("chain.cancelled");
      await sys("Угоду скасовано. USDT повернуто продавцю.");
      for (const u of [d.buyer_id, d.seller_id]) await notify(tx, u, "deal", "Угоду скасовано", null, `/deals/${d.id}`);
      await redactChat(tx, d.id);
      break;
    case "disputed": {
      await tx.query(`update deals set status = 'disputed', updated_at = now() where id = $1`, [d.id]);
      const exists = await one(tx, `select 1 from disputes where deal_id = $1`, [d.id]);
      if (!exists) {
        await tx.query(`insert into disputes (deal_id, opened_by, reason) values ($1, $2, $3)`, [
          d.id,
          actor && (actor.id === d.buyer_id || actor.id === d.seller_id) ? actor.id : d.buyer_id,
          "Спір відкрито безпосередньо в контракті",
        ]);
      }
      // Лічильник спорів — лише коли спір справді відкрито в контракті.
      await tx.query(`update profiles set disputes_count = disputes_count + 1 where id = any($1::uuid[])`, [[d.buyer_id, d.seller_id]]);
      await ev("chain.disputed");
      await sys("Відкрито спір. Модератор розгляне угоду, остаточне рішення ухвалює адміністратор.");
      await notifyStaff(tx, "dispute", "Новий спір", `${d.amount_usdt} USDT`, `/deals/${d.id}`);
      for (const u of [d.buyer_id, d.seller_id]) await notify(tx, u, "dispute", "Відкрито спір", "Кошти в ескроу до рішення адміністратора", `/deals/${d.id}`);
      break;
    }
    case "resolved":
      await tx.query(`update deals set status = 'resolved', frozen = false, closed_at = now(), updated_at = now() where id = $1`, [d.id]);
      await ev("chain.resolved");
      await sys("Адміністратор ухвалив остаточне рішення.");
      await redactChat(tx, d.id);
      break;
    case "awaiting_deposit":
      await ev("chain.created");
      break;
  }
}

/** Після закриття угоди повні номери карток у чаті маскуються. */
async function redactChat(tx: Db, dealId: string) {
  await tx.query(
    `update deal_messages set body = regexp_replace(body, '(\\d[ -]?){12}(\\d{4})', '**** **** **** \\2', 'g')
     where deal_id = $1 and body ~ '(\\d[ -]?){15}\\d'`,
    [dealId],
  );
}

async function afterPaid(ctx: Ctx, d: DealRow) {
  const risk = await assessDeal(ctx.db, ctx, {
    stage: "paid",
    dealId: d.id,
    buyerId: d.buyer_id,
    sellerId: d.seller_id,
    amountUsdt: Number(d.amount_usdt),
    actingUserId: d.buyer_id,
    meta: null,
    timing: { secondsFundedToPaid: elapsed(d.funded_at, d.paid_at) },
    senderNameMismatch: await senderMismatch(ctx.db, d),
  });
  await applyRiskDecision(ctx, d, risk);
}

export async function senderMismatch(db: Db, d: DealRow) {
  if (!d.buyer_sender_name && !d.sender_name_mismatch) return null;
  const buyer = await one<{ card_holder_name: string }>(db, `select card_holder_name from profiles where id = $1`, [d.buyer_id]);
  const expected = buyer?.card_holder_name ?? "";
  const actual = d.buyer_sender_name ?? "(інше ім'я за словами продавця)";
  if (d.sender_name_mismatch || !namesMatch(expected, actual)) return { expected, actual };
  return null;
}

/**
 * Застосовує рішення антифроду до вже профінансованої угоди:
 *  - high / жорстке правило → freezeDeal у контракті;
 *  - medium → додаткове підтвердження (підпис продавця або персонал);
 *  - невідповідність імені відправника → ЗАВЖДИ перевірка персоналом (класична схема з чужою карткою).
 */
export async function applyRiskDecision(ctx: Ctx, d: DealRow, risk: RiskResult): Promise<"frozen" | "confirm" | "ok"> {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const newLevel = d.risk_level && rank[d.risk_level] > rank[risk.level] ? d.risk_level : risk.level;
  if (risk.decision === "freeze" || risk.decision === "block") {
    let txHash: string | null = null;
    if (!d.frozen) txHash = await ctx.chain.freezeDeal(d.chain_deal_id, `antifraud:${risk.hardRule ?? "high"}`);
    await ctx.db.transaction(async (tx) => {
      await tx.query(`update deals set frozen = true, risk_level = 'high', risk_score = $2, updated_at = now() where id = $1`, [d.id, risk.score]);
      await logDealEvent(tx, d.id, null, "antifraud.frozen", { reasons: explain(risk) }, txHash);
      await systemMessage(tx, d.id, "Угоду тимчасово зупинено системою безпеки. Кошти залишаються в ескроу до рішення адміністратора.");
      await notifyStaff(tx, "risk_freeze", "Угоду заморожено антифродом", explain(risk).slice(0, 3).join("\n"), `/deals/${d.id}`);
    });
    return "frozen";
  }

  const nameMismatch = d.sender_name_mismatch || risk.signals.some((s) => s.code === "sender_name_mismatch");
  const staffDone = d.release_check === "staff" && d.release_check_done;
  if (nameMismatch && !staffDone) {
    await ctx.db.query(`update deals set release_check = 'staff', release_check_done = false, risk_level = $2, risk_score = $3 where id = $1`, [
      d.id,
      rank[newLevel] < 1 ? "medium" : newLevel,
      risk.score,
    ]);
    if (d.release_check !== "staff") {
      await logDealEvent(ctx.db, d.id, null, "antifraud.staff_required", { reason: "sender_name_mismatch" });
      await notifyStaff(ctx.db, "review", "Невідповідність імені відправника — потрібна перевірка", `${d.amount_usdt} USDT`, `/deals/${d.id}`);
    }
    return "confirm";
  }

  if (risk.decision === "confirm" && (d.release_check === "none" || d.release_check === null)) {
    const cfg = await loadConfig(ctx.db);
    await ctx.db.query(`update deals set release_check = $2, release_check_done = false, risk_level = $3, risk_score = $4 where id = $1`, [
      d.id,
      cfg.mediumAction,
      newLevel,
      risk.score,
    ]);
    await logDealEvent(ctx.db, d.id, null, "antifraud.confirm_required", { reasons: explain(risk), method: cfg.mediumAction });
    return "confirm";
  }
  await ctx.db.query(`update deals set risk_level = $2, risk_score = greatest(coalesce(risk_score, 0), $3) where id = $1`, [d.id, newLevel, risk.score]);
  return "ok";
}
