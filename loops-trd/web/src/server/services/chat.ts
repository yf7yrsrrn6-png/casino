import { z } from "zod";
import type { Ctx } from "./context";
import { asUser, one } from "../db";
import type { Actor } from "../auth";
import { forbidden } from "../errors";
import { logDealEvent } from "../audit";
import { getVisibleDeal } from "./deals";

export const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function listMessages(ctx: Ctx, actor: Actor, dealId: string, after?: string) {
  await getVisibleDeal(ctx, actor, dealId);
  return asUser(ctx.db, actor.id, async (tx) =>
    (
      await tx.query(
        `select m.id, m.sender_id, m.is_system, m.body, m.created_at, pp.display_name as sender_name, pp.role as sender_role
         from deal_messages m left join public_profiles pp on pp.id = m.sender_id
         where m.deal_id = $1 and ($2::timestamptz is null or m.created_at > $2::timestamptz)
         order by m.created_at limit 500`,
        [dealId, after ?? null],
      )
    ).rows,
  );
}

/** Повідомлення вставляється від імені користувача — RLS перевіряє, що він сторона угоди або персонал. */
export async function postMessage(ctx: Ctx, actor: Actor, dealId: string, input: z.infer<typeof messageSchema>) {
  const d = await getVisibleDeal(ctx, actor, dealId);
  if (["released", "cancelled", "resolved"].includes(d.status)) throw forbidden("Угоду закрито — чат лише для читання");
  const msg = await asUser(ctx.db, actor.id, (tx) =>
    one<{ id: string }>(tx, `insert into deal_messages (deal_id, sender_id, body) values ($1, $2, $3) returning id, created_at`, [
      dealId,
      actor.id,
      input.body,
    ]),
  );
  if (actor.id !== d.buyer_id && actor.id !== d.seller_id) {
    await logDealEvent(ctx.db, d.id, actor, "staff.chat_message");
  }
  return msg;
}
