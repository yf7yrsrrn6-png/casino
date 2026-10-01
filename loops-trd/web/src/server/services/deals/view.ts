import { z } from "zod";
import type { Ctx } from "../context";
import { asUser, one } from "../../db";
import type { Actor } from "../../auth";
import { isStaff } from "../../auth";
import { ACTIVE_STATUSES, getVisibleDeal, roleIn } from "./types";

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
        [actor.id, f.status, f.role, ACTIVE_STATUSES],
      )
    ).rows,
  );
}

interface EventRow {
  id: number;
  action: string;
  actor_wallet: string | null;
  tx_hash: string | null;
  created_at: Date;
  details?: Record<string, unknown>;
}

/** Повна картка угоди для сторони або персоналу. Службові деталі антифроду — лише персоналу. */
export async function getDealView(ctx: Ctx, actor: Actor, dealId: string) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  const role = roleIn(d, actor);
  const staff = role === "staff" && isStaff(actor);
  // Реквізити контрагента — лише сторонам угоди та персоналу (через сервер, не напряму з таблиці).
  const parties = (
    await ctx.db.query<{ id: string; display_name: string; telegram: string; card_holder_name: string; card_last4: string; successful_deals: number; disputes_lost: number }>(
      `select id, display_name, telegram, card_holder_name, card_last4, successful_deals, disputes_lost from profiles where id = any($1::uuid[])`,
      [[d.buyer_id, d.seller_id]],
    )
  ).rows;
  // Деталі подій містять пояснення антифроду — читаємо їх лише для персоналу (у БД учасникам ця колонка недоступна).
  const staffEvents = staff
    ? (await ctx.db.query<EventRow>(`select id, action, actor_wallet, tx_hash, created_at, details from deal_events where deal_id = $1 order by created_at, id`, [d.id])).rows
    : null;
  return asUser(ctx.db, actor.id, async (tx) => {
    const events =
      staffEvents ??
      (await tx.query<EventRow>(`select id, action, actor_wallet, tx_hash, created_at from deal_events where deal_id = $1 order by created_at, id`, [d.id])).rows;
    const dispute = await one(tx, `select * from disputes where deal_id = $1`, [d.id]);
    const risks = staff ? (await tx.query(`select * from risk_assessments where deal_id = $1 order by created_at`, [d.id])).rows : [];
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
    // Бали ризику бачить лише персонал.
    const deal = staff ? d : { ...d, risk_score: null };
    return {
      deal,
      role,
      seller: pub(seller, true),
      // Реквізити покупця бачать продавець (для звірки імені відправника), персонал і сам покупець.
      buyer: pub(buyer, role === "seller" || role === "buyer" || staff),
      events,
      dispute,
      risks,
      escrow: ctx.chain.escrowAddress,
      usdt: ctx.chain.usdtAddress,
      /** Пільговий період після дедлайну, коли покупець ще може відкрити спір (як у контракті). */
      graceMinutes: Number(process.env.CANCEL_GRACE_MINUTES || 15),
      /** Для підказок новачку: чи це перша угода поточного користувача. */
      firstDeal: role !== "staff" && (parties.find((p) => p.id === actor.id)?.successful_deals ?? 0) === 0,
    };
  });
}
