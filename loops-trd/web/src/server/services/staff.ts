import { z } from "zod";
import type { Hex } from "viem";
import type { Ctx } from "./context";
import { asUser, one } from "../db";
import type { Actor } from "../auth";
import { isAdmin, isStaff } from "../auth";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { logDealEvent, logStaffAction, notify, notifyStaff } from "../audit";
import { antifraudConfigSchema, saveConfig, loadConfig, signalStats, userGraph } from "../antifraud";
import { toUnits } from "../chain";
import { syncDeal, type DealRow } from "./deals";
import { verifyActionSignature } from "./identity";
import { formatUnits } from "viem";
import { USDT_DECIMALS } from "@/lib/chain";

const requireStaff = (a: Actor) => {
  if (!isStaff(a)) throw forbidden();
};
const requireAdmin = (a: Actor) => {
  if (!isAdmin(a)) throw forbidden("Лише адміністратор");
};

// ─── Черга модератора ────────────────────────────────────────────────────

export async function moderationQueue(ctx: Ctx, actor: Actor) {
  requireStaff(actor);
  return asUser(ctx.db, actor.id, async (tx) => {
    const disputes = (
      await tx.query(
        `select ds.*, d.amount_usdt, d.total_uah, d.status as deal_status, d.frozen, d.risk_level,
                sp.display_name as seller_name, bp.display_name as buyer_name
         from disputes ds join deals d on d.id = ds.deal_id
         left join public_profiles sp on sp.id = d.seller_id left join public_profiles bp on bp.id = d.buyer_id
         where ds.status <> 'resolved' order by ds.created_at`,
      )
    ).rows;
    const flagged = (
      await tx.query(
        `select d.*, sp.display_name as seller_name, bp.display_name as buyer_name
         from deals d left join public_profiles sp on sp.id = d.seller_id left join public_profiles bp on bp.id = d.buyer_id
         where d.status in ('awaiting_deposit', 'funded', 'paid', 'disputed')
           and (d.frozen or (d.release_check = 'staff' and not d.release_check_done) or d.risk_level in ('medium', 'high'))
         order by d.frozen desc, d.created_at`,
      )
    ).rows;
    const resolvedUnlabeled = (
      await tx.query(
        `select ds.*, d.amount_usdt, d.status as deal_status, sp.display_name as seller_name, bp.display_name as buyer_name
         from disputes ds join deals d on d.id = ds.deal_id
         left join public_profiles sp on sp.id = d.seller_id left join public_profiles bp on bp.id = d.buyer_id
         where ds.status = 'resolved' and ds.fraud_label is null order by ds.resolved_at desc limit 50`,
      )
    ).rows;
    return { disputes, flagged, resolvedUnlabeled };
  });
}

export const recommendSchema = z.object({
  recommendation: z.string().trim().min(5).max(2000),
  toBuyer: z.coerce.number().min(0),
});

/** Модератор дає рекомендацію адміну. Жодного руху коштів. */
export async function recommend(ctx: Ctx, actor: Actor, dealId: string, input: z.infer<typeof recommendSchema>) {
  requireStaff(actor);
  const d = await one<DealRow>(ctx.db, `select * from deals where id = $1`, [dealId]);
  if (!d) throw notFound();
  if (input.toBuyer > Number(d.amount_usdt)) throw badRequest("Сума більша за угоду");
  const r = await one(
    ctx.db,
    `update disputes set status = 'recommended', moderator_id = $2, recommendation = $3, recommended_to_buyer = $4, recommended_at = now()
     where deal_id = $1 and status <> 'resolved' returning id`,
    [dealId, actor.id, input.recommendation, input.toBuyer],
  );
  if (!r) throw notFound("Відкритого спору немає");
  await logStaffAction(ctx.db, actor, "dispute.recommend", { type: "deal", id: dealId }, input);
  await logDealEvent(ctx.db, dealId, actor, "staff.recommendation", input);
  await notifyStaff(ctx.db, "recommendation", "Рекомендація модератора", input.recommendation.slice(0, 140), `/admin/disputes`, true);
}

// ─── Рішення адміна ──────────────────────────────────────────────────────

export const resolveSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  note: z.string().trim().min(3).max(2000),
});

/**
 * Адмін викликає resolveDispute зі свого гаманця (ARBITER_ROLE), потім передає txHash.
 * Сервер звіряє подію DisputeResolved у блокчейні — розподіл береться з контракту, а не з клієнта.
 */
export async function recordResolution(ctx: Ctx, actor: Actor, dealId: string, input: z.infer<typeof resolveSchema>) {
  requireAdmin(actor);
  const d = await one<DealRow>(ctx.db, `select * from deals where id = $1`, [dealId]);
  if (!d) throw notFound();
  const res = await ctx.chain.readResolution(input.txHash as Hex, d.chain_deal_id);
  if (!res) throw badRequest("У транзакції немає події DisputeResolved для цієї угоди");
  await syncDeal(ctx, dealId, actor);
  const toBuyer = Number(formatUnits(res.toBuyer, USDT_DECIMALS));
  const full = toUnits(d.amount_usdt);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `insert into disputes (deal_id, opened_by, reason) values ($1, $2, 'Рішення адміністратора щодо замороженої угоди')
       on conflict (deal_id) do nothing`,
      [dealId, d.buyer_id],
    );
    await tx.query(
      `update disputes set status = 'resolved', admin_id = $2, resolution_to_buyer = $3, resolution_note = $4,
         resolve_tx_hash = $5, resolved_at = now() where deal_id = $1`,
      [dealId, actor.id, toBuyer, input.note, input.txHash],
    );
    // Хто програв спір — впливає на репутацію та сигнали.
    if (res.toBuyer === full) await tx.query(`update profiles set disputes_lost = disputes_lost + 1 where id = $1`, [d.seller_id]);
    else if (res.toBuyer === BigInt(0)) await tx.query(`update profiles set disputes_lost = disputes_lost + 1 where id = $1`, [d.buyer_id]);
    await logStaffAction(tx, actor, "dispute.resolve", { type: "deal", id: dealId }, { toBuyer, note: input.note }, input.txHash);
    await logDealEvent(tx, dealId, actor, "admin.resolved", { toBuyer, toSeller: formatUnits(res.toSeller, USDT_DECIMALS), note: input.note }, input.txHash);
    for (const u of [d.buyer_id, d.seller_id]) await notify(tx, u, "dispute", "Рішення щодо угоди", input.note.slice(0, 200), `/deals/${dealId}`);
  });
}

export const labelSchema = z.object({ label: z.enum(["fraud", "honest"]) });

/** Зворотний зв'язок для антифроду: розмітка завершених спорів. */
export async function labelDispute(ctx: Ctx, actor: Actor, dealId: string, input: z.infer<typeof labelSchema>) {
  requireAdmin(actor);
  const r = await one(
    ctx.db,
    `update disputes set fraud_label = $2, labeled_by = $3, labeled_at = now() where deal_id = $1 and status = 'resolved' returning id`,
    [dealId, input.label, actor.id],
  );
  if (!r) throw conflict("Позначати можна лише вирішені спори");
  await logStaffAction(ctx.db, actor, "dispute.label", { type: "deal", id: dealId }, input);
}

/** Розморожування до депозиту (лише БД; у контракті коштів ще немає). Заморожені в контракті — через unfreezeDeal гаманцем адміна. */
export async function adminDecideFrozen(
  ctx: Ctx,
  actor: Actor,
  dealId: string,
  input: { decision: "allow" | "cancel"; note: string },
  signed: { nonce?: string; signature?: string } | undefined,
) {
  requireAdmin(actor);
  const signature = await verifyActionSignature(ctx.db, actor, "deal.frozen_decision", { dealId, ...input }, signed);
  const d = await one<DealRow>(ctx.db, `select * from deals where id = $1`, [dealId]);
  if (!d) throw notFound();
  if (!d.frozen) throw conflict("Угода не заморожена");
  if (d.status !== "awaiting_deposit") {
    throw conflict("Кошти вже в ескроу: використайте resolveDispute або unfreezeDeal з гаманця адміністратора");
  }
  await ctx.db.transaction(async (tx) => {
    if (input.decision === "allow") {
      await tx.query(
        `update deals set frozen = false, release_check = 'staff', payment_deadline = now() + interval '30 minutes', updated_at = now() where id = $1`,
        [dealId],
      );
    } else {
      await tx.query(`update deals set status = 'cancelled', closed_at = now(), updated_at = now() where id = $1`, [dealId]);
    }
    await logStaffAction(tx, actor, "deal.frozen_decision", { type: "deal", id: dealId }, input, signature);
    await logDealEvent(tx, dealId, actor, `admin.${input.decision === "allow" ? "unfrozen" : "cancelled"}`, { note: input.note });
    for (const u of [d.buyer_id, d.seller_id]) {
      await notify(tx, u, "deal", input.decision === "allow" ? "Угоду дозволено" : "Угоду скасовано адміністратором", input.note, `/deals/${dealId}`);
    }
  });
}

// ─── Адмін: дашборд, учасники, журнал ────────────────────────────────────

export async function dashboard(ctx: Ctx, actor: Actor) {
  requireAdmin(actor);
  // Газ серверного гаманця: без tBNB зупиняться approveRelease / freezeDeal / автоскасування.
  const gas = ctx.chain.configured
    ? await ctx.chain.signerBalance().then((g) => ({ ...g, low: Number(g.balance) < Number(process.env.LOW_GAS_THRESHOLD || 0.02) })).catch(() => null)
    : null;
  const keeper = await one<{ updated_at: Date }>(ctx.db, `select updated_at from chain_cursor where id = 'escrow'`);
  return asUser(ctx.db, actor.id, async (tx) => {
    const stats = await one(
      tx,
      `select
        (select count(*) from deals) as deals_total,
        (select count(*) from deals where status in ('awaiting_deposit','funded','paid','disputed')) as deals_active,
        (select coalesce(sum(amount_usdt),0) from deals where status = 'released') as volume_usdt,
        (select coalesce(sum(amount_usdt),0) from deals where status = 'released' and closed_at > now() - interval '24 hours') as volume_24h,
        (select count(*) from disputes where status <> 'resolved') as disputes_open,
        (select count(*) from deals where frozen and status not in ('released','cancelled','resolved')) as frozen,
        (select count(*) from profiles where status = 'pending' and profile_completed) as applications,
        (select count(*) from change_requests where status = 'pending') as change_requests,
        (select count(*) from profiles where status = 'approved') as members`,
    );
    const recent = (
      await tx.query(
        `select d.id, d.amount_usdt, d.total_uah, d.status, d.frozen, d.risk_level, d.created_at,
                sp.display_name as seller_name, bp.display_name as buyer_name
         from deals d left join public_profiles sp on sp.id = d.seller_id left join public_profiles bp on bp.id = d.buyer_id
         order by d.created_at desc limit 10`,
      )
    ).rows;
    const daily = (
      await tx.query(
        `select to_char(date_trunc('day', created_at at time zone 'Europe/Kyiv'), 'YYYY-MM-DD') as day,
                count(*) as deals, coalesce(sum(amount_usdt) filter (where status = 'released'), 0) as volume
         from deals where created_at > now() - interval '14 days' group by 1 order by 1`,
      )
    ).rows;
    const system = (await tx.query(`select * from system_events where level <> 'info' order by created_at desc limit 10`)).rows;
    return { stats, recent, daily, gas, keeperLastRun: keeper?.updated_at ?? null, system };
  });
}

export async function listUsers(ctx: Ctx, actor: Actor, status?: string) {
  requireStaff(actor);
  return asUser(ctx.db, actor.id, async (tx) => ({
    users: (
      await tx.query(
        `select id, wallet_address, role, status, display_name, telegram, card_holder_name, card_last4, profile_completed,
                successful_deals, disputes_count, disputes_lost, single_limit_override, daily_limit_override, status_reason,
                created_at, approved_at
         from profiles where ($1::text is null or status::text = $1) order by
           case status when 'pending' then 0 when 'approved' then 1 else 2 end, created_at desc`,
        [status ?? null],
      )
    ).rows,
    changeRequests: (
      await tx.query(
        `select c.*, p.display_name, p.wallet_address, p.card_holder_name, p.card_last4
         from change_requests c join profiles p on p.id = c.user_id where c.status = 'pending' order by c.created_at`,
      )
    ).rows,
    invites: isAdmin(actor)
      ? (await tx.query(`select id, code_hint, note, expires_at, used_by, used_at, revoked_at, created_at from invite_codes order by created_at desc limit 50`)).rows
      : [],
  }));
}

export async function systemEvents(ctx: Ctx, actor: Actor) {
  requireAdmin(actor);
  return asUser(ctx.db, actor.id, async (tx) => (await tx.query(`select * from system_events order by created_at desc limit 300`)).rows);
}

export async function auditLog(ctx: Ctx, actor: Actor, filter: { actorId?: string; limit?: number }) {
  requireStaff(actor);
  return asUser(ctx.db, actor.id, async (tx) =>
    (
      await tx.query(
        `select s.*, p.display_name as actor_name from staff_actions s left join profiles p on p.id = s.actor_id
         where ($1::uuid is null or s.actor_id = $1) order by s.created_at desc limit $2`,
        [filter.actorId ?? null, Math.min(filter.limit ?? 200, 500)],
      )
    ).rows,
  );
}

/** Журнал усіх дій в угодах — для персоналу. */
export async function dealEventsLog(ctx: Ctx, actor: Actor, limit = 200) {
  requireStaff(actor);
  // Персонал бачить деталі подій; колонка details закрита для ролі authenticated, тож читаємо через сервер.
  return (await ctx.db.query(`select * from deal_events order by created_at desc limit $1`, [Math.min(limit, 500)])).rows;
}

// ─── Антифрод: адмінка ───────────────────────────────────────────────────

export async function antifraudOverview(ctx: Ctx, actor: Actor) {
  requireStaff(actor);
  const config = await loadConfig(ctx.db);
  const stats = await signalStats(ctx.db);
  return asUser(ctx.db, actor.id, async (tx) => ({
    config,
    queue: (
      await tx.query(
        `select ra.*, p.display_name, p.wallet_address, d.status as deal_status, d.amount_usdt, d.frozen
         from risk_assessments ra join profiles p on p.id = ra.user_id left join deals d on d.id = ra.deal_id
         where ra.level <> 'low' order by ra.created_at desc limit 100`,
      )
    ).rows,
    stats,
    blacklist: (await tx.query(`select * from blacklist order by created_at desc`)).rows,
  }));
}

export async function updateAntifraudConfig(ctx: Ctx, actor: Actor, raw: unknown, signed: { nonce?: string; signature?: string } | undefined) {
  requireAdmin(actor);
  const parsed = antifraudConfigSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Невірні налаштування: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const signature = await verifyActionSignature(ctx.db, actor, "antifraud.config", parsed.data, signed);
  const before = await loadConfig(ctx.db);
  await saveConfig(ctx.db, parsed.data, actor.id);
  await logStaffAction(ctx.db, actor, "antifraud.config", { type: "settings", id: "antifraud" }, { before, after: parsed.data }, signature);
}

export const blacklistSchema = z.object({
  kind: z.enum(["wallet", "card", "device", "ip"]),
  value: z.string().trim().min(3).max(128),
  reason: z.string().trim().min(3).max(300),
});

export async function addBlacklist(ctx: Ctx, actor: Actor, input: z.infer<typeof blacklistSchema>, signed: { nonce?: string; signature?: string } | undefined) {
  requireAdmin(actor);
  const value = input.kind === "wallet" ? input.value.toLowerCase() : input.value;
  if (input.kind === "card" && !/^\d{4}$/.test(value)) throw badRequest("Для картки — 4 останні цифри");
  const signature = await verifyActionSignature(ctx.db, actor, "blacklist.add", { ...input, value }, signed);
  await ctx.db.query(
    `insert into blacklist (kind, value, reason, created_by) values ($1, $2, $3, $4) on conflict (kind, value) do update set reason = excluded.reason`,
    [input.kind, value, input.reason, actor.id],
  );
  await logStaffAction(ctx.db, actor, "blacklist.add", { type: "blacklist", id: `${input.kind}:${value}` }, input, signature);
}

export async function removeBlacklist(ctx: Ctx, actor: Actor, id: string, signed: { nonce?: string; signature?: string } | undefined) {
  requireAdmin(actor);
  const signature = await verifyActionSignature(ctx.db, actor, "blacklist.remove", { id }, signed);
  const r = await one(ctx.db, `delete from blacklist where id = $1 returning kind, value`, [id]);
  if (!r) throw notFound();
  await logStaffAction(ctx.db, actor, "blacklist.remove", { type: "blacklist", id }, r as Record<string, unknown>, signature);
}

export async function graphFor(ctx: Ctx, actor: Actor, userId: string) {
  requireStaff(actor);
  const user = await one(ctx.db, `select id, display_name, wallet_address, status, card_last4, card_holder_name, created_at from profiles where id = $1`, [userId]);
  if (!user) throw notFound();
  return { user, links: await userGraph(ctx.db, userId) };
}
