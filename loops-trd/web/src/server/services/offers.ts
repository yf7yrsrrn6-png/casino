import { z } from "zod";
import type { Ctx } from "./context";
import { asUser, one } from "../db";
import type { Actor } from "../auth";
import { badRequest, forbidden, notFound } from "../errors";

export const PAYMENT_METHODS = ["Monobank", "ПриватБанк", "ПУМБ", "А-Банк", "Sense Bank", "Ощадбанк", "Райффайзен", "Готівка"] as const;

const money = (max: number) =>
  z
    .union([z.number(), z.string()])
    .transform(Number)
    .pipe(z.number().positive().max(max))
    .refine((n) => Math.round(n * 100) === n * 100, "Не більше 2 знаків після коми");

export const offerSchema = z
  .object({
    side: z.enum(["buy", "sell"]),
    price_uah: money(1000),
    min_usdt: money(1_000_000),
    max_usdt: money(1_000_000),
    payment_methods: z.array(z.enum(PAYMENT_METHODS)).min(1).max(8),
    terms: z.string().trim().max(500).optional().default(""),
  })
  .refine((o) => o.max_usdt >= o.min_usdt, { message: "Максимум має бути ≥ мінімуму", path: ["max_usdt"] });

export const offerFilterSchema = z.object({
  side: z.enum(["buy", "sell", "all"]).default("all"),
  method: z.string().max(40).optional(),
  mine: z.coerce.boolean().default(false),
});

export async function listOffers(ctx: Ctx, actor: Actor, f: z.infer<typeof offerFilterSchema>) {
  return asUser(ctx.db, actor.id, async (tx) =>
    (
      await tx.query(
        `select o.*, p.display_name, p.successful_deals, p.disputes_lost
         from offers o left join public_profiles p on p.id = o.user_id
         where ($1 = 'all' or o.side = $1::offer_side)
           and ($2::text is null or $2 = any(o.payment_methods))
           and (case when $3 then o.user_id = $4 else o.is_active end)
         order by case when o.side = 'sell' then o.price_uah end asc,
                  case when o.side = 'buy' then o.price_uah end desc, o.created_at desc
         limit 200`,
        [f.side, f.method ?? null, f.mine, actor.id],
      )
    ).rows,
  );
}

/** Вставка від імені користувача: RLS додатково гарантує user_id = auth uid та статус approved. */
export async function createOffer(ctx: Ctx, actor: Actor, input: z.infer<typeof offerSchema>) {
  if (actor.status !== "approved") throw forbidden("Обліковий запис ще не підтверджено");
  if (!actor.profile_completed) throw forbidden("Заповніть профіль");
  const count = await one<{ c: string }>(ctx.db, `select count(*) as c from offers where user_id = $1 and is_active`, [actor.id]);
  if (Number(count?.c ?? 0) >= 10) throw badRequest("Не більше 10 активних оголошень");
  return asUser(ctx.db, actor.id, (tx) =>
    one(
      tx,
      `insert into offers (user_id, side, price_uah, min_usdt, max_usdt, payment_methods, terms)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [actor.id, input.side, input.price_uah, input.min_usdt, input.max_usdt, input.payment_methods, input.terms],
    ),
  );
}

export const offerUpdateSchema = z.object({ is_active: z.boolean() });

export async function updateOffer(ctx: Ctx, actor: Actor, id: string, input: z.infer<typeof offerUpdateSchema>) {
  if (!z.string().uuid().safeParse(id).success) throw notFound();
  const r = await asUser(ctx.db, actor.id, (tx) =>
    one(tx, `update offers set is_active = $2, updated_at = now() where id = $1 and user_id = $3 returning id`, [id, input.is_active, actor.id]),
  );
  if (!r) throw notFound("Оголошення не знайдено");
}
