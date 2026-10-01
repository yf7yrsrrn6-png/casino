import { z } from "zod";
import type { Hex } from "viem";
import type { Ctx } from "./context";
import { asUser, one, type Db } from "../db";
import type { Actor, RequestMeta } from "../auth";
import { isStaff } from "../auth";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../errors";
import { logDealEvent, logStaffAction, notify, notifyStaff } from "../audit";
import { assessDeal, loadConfig, namesMatch, recordDevice, explain, type RiskResult } from "../antifraud";
import { chainDealId } from "@/lib/chain";
import { toUnits, type OnchainDeal } from "../chain";
import { createActionChallenge, verifyActionSignature } from "./identity";

export const DEPOSIT_WINDOW_MIN = 30;
const ACTIVE = ["awaiting_deposit", "funded", "paid", "disputed"] as const;

export interface DealRow {
  id: string;
  chain_deal_id: Hex;
  offer_id: string | null;
  seller_id: string;
  buyer_id: string;
  seller_wallet: string;
  buyer_wallet: string;
  amount_usdt: string;
  price_uah: string;
  total_uah: string;
  payment_method: string;
  status: "awaiting_deposit" | "funded" | "paid" | "released" | "cancelled" | "disputed" | "resolved" | "blocked";
  frozen: boolean;
  release_approved: boolean;
  risk_level: "low" | "medium" | "high" | null;
  risk_score: number | null;
  release_check: "none" | "wallet_signature" | "staff" | null;
  release_check_done: boolean;
  buyer_sender_name: string | null;
  sender_name_mismatch: boolean;
  payment_deadline: Date | null;
  funded_at: Date | null;
  paid_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
}

const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .pipe(z.number().positive().max(1_000_000))
  .refine((n) => Math.round(n * 100) === n * 100, "Не більше 2 знаків після коми");

export const createDealSchema = z.object({
  offerId: z.string().uuid(),
  amountUsdt: amountSchema,
  paymentMethod: z.string().min(2).max(40),
});

const lockDeal = (db: Db, id: string) => one<DealRow>(db, `select * from deals where id = $1 for update`, [id]);

/** Учасник має бачити угоду (перевірка через RLS — так само, як у БД). */
export async function getVisibleDeal(ctx: Ctx, actor: Actor, dealId: string): Promise<DealRow> {
  if (!z.string().uuid().safeParse(dealId).success) throw notFound("Угоду не знайдено");
  const d = await asUser(ctx.db, actor.id, (tx) => one<DealRow>(tx, `select * from deals where id = $1`, [dealId]));
  if (!d) throw notFound("Угоду не знайдено");
  return d;
}

function roleIn(d: DealRow, actor: Actor): "buyer" | "seller" | "staff" | null {
  if (d.buyer_id === actor.id) return "buyer";
  if (d.seller_id === actor.id) return "seller";
  return isStaff(actor) ? "staff" : null;
}

/** Причини, які можна показати учаснику (ліміти). Решту правил не розкриваємо. */
function publicBlockReason(r: RiskResult) {
  const limit = r.hardReasons.find((x) => x.includes("ліміт"));
  return limit ?? "Угоду відхилено системою безпеки. Зверніться до адміністратора.";
}

// ─── Створення угоди (відгук на оголошення) ──────────────────────────────

export async function createDeal(ctx: Ctx, actor: Actor, meta: RequestMeta, input: z.infer<typeof createDealSchema>) {
  if (actor.status !== "approved") throw forbidden("Обліковий запис ще не підтверджено");
  await recordDevice(ctx.db, actor.id, meta, ctx.ipIntel);

  const offer = await one<{
    id: string;
    user_id: string;
    side: "buy" | "sell";
    price_uah: string;
    min_usdt: string;
    max_usdt: string;
    payment_methods: string[];
    is_active: boolean;
  }>(ctx.db, `select * from offers where id = $1`, [input.offerId]);
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

  // Антифрод — до створення угоди. Обійти його неможливо: підпис для контракту видається лише після цього.
  const risk = await assessDeal(ctx.db, ctx, {
    stage: "create",
    dealId: null,
    buyerId,
    sellerId,
    amountUsdt: input.amountUsdt,
    actingUserId: actor.id,
    meta,
  });
  if (risk.decision === "block") {
    await notifyStaff(ctx.db, "risk_block", "Антифрод заблокував угоду", risk.hardReasons.join("; "), "/admin/antifraud");
    throw new HttpError(403, publicBlockReason(risk), "antifraud_block");
  }

  const cfg = await loadConfig(ctx.db);
  const releaseCheck = risk.level === "low" ? "none" : risk.level === "medium" ? cfg.mediumAction : "staff";
  const price = Number(offer.price_uah);

  return ctx.db.transaction(async (tx) => {
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
    await tx.query(
      `insert into deal_messages (deal_id, is_system, body) values ($1, true, $2)`,
      [id, "Угоду створено. Продавець має внести USDT в ескроу протягом 30 хв. Підтверджуйте лише після надходження коштів у банк, не за скріншотом."],
    );
    const other = actor.id === sellerId ? buyerId : sellerId;
    await notify(tx, other, "deal", "Нова угода", `${input.amountUsdt} USDT за ${price} ₴`, `/deals/${id}`);
    if (risk.decision === "freeze") {
      await logDealEvent(tx, id, null, "antifraud.frozen", { reasons: explain(risk) });
      await notifyStaff(tx, "risk_freeze", "Угоду зупинено антифродом (високий ризик)", explain(risk).slice(0, 3).join("\n"), `/mod/deals/${id}`);
    }
    return deal!;
  });
}

// ─── Підпис для createDeal у контракті ───────────────────────────────────

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

// ─── Синхронізація зі смарт-контрактом (джерело правди — блокчейн) ───────

export async function syncDeal(ctx: Ctx, dealId: string, actor: Actor | null = null): Promise<DealRow> {
  const onchain = await ctx.chain.getDeal(
    (await one<{ chain_deal_id: Hex }>(ctx.db, `select chain_deal_id from deals where id = $1`, [dealId]))?.chain_deal_id ??
      (() => {
        throw notFound();
      })(),
  );
  const postPaid: { run: boolean; deal?: DealRow } = { run: false };
  const updated = await ctx.db.transaction(async (tx) => {
    const d = (await lockDeal(tx, dealId))!;
    await applyOnchain(ctx, tx, d, onchain, actor, postPaid);
    return (await one<DealRow>(tx, `select * from deals where id = $1`, [dealId]))!;
  });
  // Оцінка після «Я оплатив» — поза транзакцією (може надсилати транзакцію freezeDeal).
  if (postPaid.run) await afterPaid(ctx, updated);
  return (await one<DealRow>(ctx.db, `select * from deals where id = $1`, [dealId]))!;
}

async function applyOnchain(ctx: Ctx, tx: Db, d: DealRow, oc: OnchainDeal, actor: Actor | null, postPaid: { run: boolean }) {
  if (oc.status === "None") return;
  if (oc.seller !== d.seller_wallet || oc.buyer !== d.buyer_wallet || oc.amount !== toUnits(d.amount_usdt)) {
    await logDealEvent(tx, d.id, null, "chain.mismatch", { onchain: { seller: oc.seller, buyer: oc.buyer, amount: oc.amount.toString() } });
    return;
  }
  const ev = (action: string, details: Record<string, unknown> = {}) => logDealEvent(tx, d.id, actor, action, details);
  const sys = (body: string) => tx.query(`insert into deal_messages (deal_id, is_system, body) values ($1, true, $2)`, [d.id, body]);

  if (oc.frozen !== d.frozen) {
    await tx.query(`update deals set frozen = $2, updated_at = now() where id = $1`, [d.id, oc.frozen]);
    await ev(oc.frozen ? "chain.frozen" : "chain.unfrozen");
  }
  if (oc.reviewApproved && !d.release_approved) {
    await tx.query(`update deals set release_approved = true where id = $1`, [d.id]);
  }

  const target = (
    { Created: "awaiting_deposit", Funded: "funded", Paid: "paid", Released: "released", Cancelled: "cancelled", Disputed: "disputed", Resolved: "resolved" } as const
  )[oc.status];
  if (target === d.status) {
    if (target === "funded" && oc.paymentDeadline) {
      await tx.query(`update deals set payment_deadline = to_timestamp($2) where id = $1`, [d.id, oc.paymentDeadline]);
    }
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
      await notify(tx, d.buyer_id, "deal", "USDT в ескроу — можна оплачувати", `${d.total_uah} ₴`, `/deals/${d.id}`);
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
      await ev("chain.disputed");
      await sys("Відкрито спір. Модератор розгляне угоду, остаточне рішення ухвалює адміністратор.");
      await notifyStaff(tx, "dispute", "Новий спір", `${d.amount_usdt} USDT`, `/mod/deals/${d.id}`);
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
    timing: { secondsFundedToPaid: d.funded_at && d.paid_at ? (new Date(d.paid_at).getTime() - new Date(d.funded_at).getTime()) / 1000 : null },
    senderNameMismatch: await senderMismatch(ctx.db, d),
  });
  await applyRiskDecision(ctx, d, risk);
}

async function senderMismatch(db: Db, d: DealRow) {
  if (!d.buyer_sender_name && !d.sender_name_mismatch) return null;
  const buyer = await one<{ card_holder_name: string }>(db, `select card_holder_name from profiles where id = $1`, [d.buyer_id]);
  const expected = buyer?.card_holder_name ?? "";
  const actual = d.buyer_sender_name ?? "(інше ім'я за словами продавця)";
  if (d.sender_name_mismatch || !namesMatch(expected, actual)) return { expected, actual };
  return null;
}

/** Застосовує рішення антифроду до вже профінансованої угоди. */
async function applyRiskDecision(ctx: Ctx, d: DealRow, risk: RiskResult) {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const newLevel = d.risk_level && rank[d.risk_level] > rank[risk.level] ? d.risk_level : risk.level;
  if (risk.decision === "freeze" || risk.decision === "block") {
    let txHash: string | null = null;
    if (!d.frozen) txHash = await ctx.chain.freezeDeal(d.chain_deal_id, `antifraud:${risk.hardRule ?? "high"}`);
    await ctx.db.transaction(async (tx) => {
      await tx.query(`update deals set frozen = true, risk_level = 'high', risk_score = $2, updated_at = now() where id = $1`, [d.id, risk.score]);
      await logDealEvent(tx, d.id, null, "antifraud.frozen", { reasons: explain(risk) }, txHash);
      await tx.query(`insert into deal_messages (deal_id, is_system, body) values ($1, true, $2)`, [
        d.id,
        "Угоду тимчасово зупинено системою безпеки. Кошти залишаються в ескроу до рішення адміністратора.",
      ]);
      await notifyStaff(tx, "risk_freeze", "Угоду заморожено антифродом", explain(risk).slice(0, 3).join("\n"), `/mod/deals/${d.id}`);
    });
    return "frozen" as const;
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
    return "confirm" as const;
  }
  await ctx.db.query(`update deals set risk_level = $2, risk_score = greatest(coalesce(risk_score, 0), $3) where id = $1`, [d.id, newLevel, risk.score]);
  return "ok" as const;
}

// ─── «Я оплатив» ─────────────────────────────────────────────────────────

export const paidIntentSchema = z.object({ senderName: z.string().trim().min(3).max(80) });

/** Покупець вказує ім'я відправника перед транзакцією markPaid. */
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

// ─── Відпуск коштів: серверна перевірка → approveRelease → confirmRelease продавцем ──

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

  if (!d.release_approved) {
    const risk = await assessDeal(ctx.db, ctx, {
      stage: "release",
      dealId: d.id,
      buyerId: d.buyer_id,
      sellerId: d.seller_id,
      amountUsdt: Number(d.amount_usdt),
      actingUserId: actor.id,
      meta,
      timing: { secondsPaidToRelease: d.paid_at ? (ctx.now().getTime() - new Date(d.paid_at).getTime()) / 1000 : null },
      senderNameMismatch: await senderMismatch(ctx.db, d),
    });
    const outcome = await applyRiskDecision(ctx, d, risk);
    if (outcome === "frozen") return { status: "frozen" };
    d = (await one<DealRow>(ctx.db, `select * from deals where id = $1`, [d.id]))!;
    if (d.release_check && d.release_check !== "none" && !d.release_check_done) {
      if (d.release_check === "wallet_signature") {
        const ch = await createActionChallenge(ctx, actor, "deal.release_confirm", { dealId: d.id, amountUsdt: d.amount_usdt });
        return { status: "needs_signature", ...ch };
      }
      await notifyStaff(ctx.db, "review", "Потрібна перевірка перед відпуском коштів", `${d.amount_usdt} USDT`, `/mod/deals/${d.id}`);
      return { status: "needs_staff" };
    }
    await approveOnChain(ctx, d, null);
  }
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

/** Модератор/адмін підтверджує перевірку середнього ризику. Кошти відпускає все одно лише продавець. */
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

// ─── Скасування / спір ───────────────────────────────────────────────────

/** Скасування до внесення депозиту (у контракті коштів немає). */
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

/** Фіксує причину спору. Далі сторона викликає openDispute у контракті, а sync оновлює статус. */
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
    await tx.query(`update profiles set disputes_count = disputes_count + 1 where id = any($1::uuid[])`, [[d.buyer_id, d.seller_id]]);
    await logDealEvent(tx, d.id, actor, "dispute.opened", { reason: input.reason });
    await notifyStaff(tx, "dispute", "Відкрито спір", input.reason.slice(0, 140), `/mod/deals/${d.id}`);
  });
}

// ─── Перегляд ────────────────────────────────────────────────────────────

export const dealFilterSchema = z.object({
  status: z.enum(["active", "closed", "all"]).default("all"),
  role: z.enum(["buyer", "seller", "all"]).default("all"),
});

export async function listMyDeals(ctx: Ctx, actor: Actor, f: z.infer<typeof dealFilterSchema>) {
  return asUser(ctx.db, actor.id, async (tx) =>
    (
      await tx.query(
        `select d.*, sp.display_name as seller_name, bp.display_name as buyer_name
         from deals d
         left join public_profiles sp on sp.id = d.seller_id
         left join public_profiles bp on bp.id = d.buyer_id
         where (d.buyer_id = $1 or d.seller_id = $1)
           and ($2 = 'all' or ($2 = 'active' and d.status = any($4::deal_status[])) or ($2 = 'closed' and not d.status = any($4::deal_status[])))
           and ($3 = 'all' or ($3 = 'buyer' and d.buyer_id = $1) or ($3 = 'seller' and d.seller_id = $1))
         order by d.created_at desc limit 200`,
        [actor.id, f.status, f.role, ACTIVE],
      )
    ).rows,
  );
}

/** Повна картка угоди для сторони або персоналу. */
export async function getDealView(ctx: Ctx, actor: Actor, dealId: string) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  const role = roleIn(d, actor);
  // Реквізити контрагента — лише сторонам угоди та персоналу (через сервер, не напряму з таблиці).
  const parties = (
      await ctx.db.query<{ id: string; display_name: string; telegram: string; card_holder_name: string; card_last4: string; successful_deals: number; disputes_lost: number }>(
        `select id, display_name, telegram, card_holder_name, card_last4, successful_deals, disputes_lost from profiles where id = any($1::uuid[])`,
        [[d.buyer_id, d.seller_id]],
      )
    ).rows;
  return asUser(ctx.db, actor.id, async (tx) => {
    const events = (await tx.query(`select * from deal_events where deal_id = $1 order by created_at`, [d.id])).rows;
    const dispute = await one(tx, `select * from disputes where deal_id = $1`, [d.id]);
    const risks = isStaff(actor)
      ? (await tx.query(`select * from risk_assessments where deal_id = $1 order by created_at`, [d.id])).rows
      : [];
    const pub = (p: (typeof parties)[number] | undefined, showPayment: boolean) =>
      p && {
        id: p.id,
        display_name: p.display_name,
        telegram: p.telegram,
        successful_deals: p.successful_deals,
        disputes_lost: p.disputes_lost,
        ...(showPayment ? { card_holder_name: p.card_holder_name, card_last4: p.card_last4 } : {}),
      };
    const seller = parties.find((p) => p.id === d.seller_id);
    const buyer = parties.find((p) => p.id === d.buyer_id);
    // Покупцю потрібні ім'я власника та останні 4 цифри картки продавця; продавцю — ім'я покупця для звірки.
    // Бали ризику бачить лише персонал.
    const deal = role === "staff" ? d : { ...d, risk_score: null };
    return {
      deal,
      role,
      seller: pub(seller, true),
      buyer: pub(buyer, role === "seller" || role === "staff"),
      events,
      dispute,
      risks,
      escrow: ctx.chain.escrowAddress,
      usdt: ctx.chain.usdtAddress,
    };
  });
}

// ─── Кіпер: автоскасування та синхронізація ──────────────────────────────

export async function keeperTick(ctx: Ctx) {
  const report = { expiredBeforeDeposit: 0, cancelledOnChain: 0, synced: 0, errors: [] as string[] };
  const stale = (
    await ctx.db.query<DealRow>(
      `select * from deals where status = 'awaiting_deposit' and payment_deadline < $1 and not frozen`,
      [ctx.now()],
    )
  ).rows;
  for (const d of stale) {
    try {
      const oc = ctx.chain.configured ? await ctx.chain.getDeal(d.chain_deal_id) : null;
      if (oc && oc.status !== "None" && oc.status !== "Created") {
        await syncDeal(ctx, d.id);
        continue;
      }
      await ctx.db.transaction(async (tx) => {
        await tx.query(`update deals set status = 'cancelled', closed_at = now() where id = $1`, [d.id]);
        await logDealEvent(tx, d.id, null, "keeper.auto_cancel", { reason: "Продавець не вніс USDT за 30 хв" });
        await tx.query(`insert into deal_messages (deal_id, is_system, body) values ($1, true, $2)`, [d.id, "Автоскасування: USDT не внесено вчасно."]);
      });
      report.expiredBeforeDeposit++;
    } catch (e) {
      report.errors.push(`${d.id}: ${(e as Error).message}`);
    }
  }
  if (!ctx.chain.configured) return report;

  const active = (await ctx.db.query<DealRow>(`select * from deals where status in ('funded', 'paid', 'disputed')`)).rows;
  const chainNow = active.length ? await ctx.chain.blockTime() : 0;
  for (const d of active) {
    try {
      const oc = await ctx.chain.getDeal(d.chain_deal_id);
      const openDisputeRow = await one(ctx.db, `select 1 from disputes where deal_id = $1 and status <> 'resolved'`, [d.id]);
      if (oc.status === "Funded" && !oc.frozen && !openDisputeRow && chainNow > oc.paymentDeadline) {
        const hash = await ctx.chain.cancel(d.chain_deal_id);
        await logDealEvent(ctx.db, d.id, null, "keeper.auto_cancel", { reason: "Оплату не позначено за 30 хв" }, hash);
        report.cancelledOnChain++;
      }
      await syncDeal(ctx, d.id);
      report.synced++;
    } catch (e) {
      report.errors.push(`${d.id}: ${(e as Error).message}`);
    }
  }
  return report;
}
