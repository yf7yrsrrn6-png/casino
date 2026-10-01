import { z } from "zod";
import type { Hex } from "viem";
import type { Ctx } from "../context";
import { asUser, one, type Db } from "../../db";
import type { Actor } from "../../auth";
import { isStaff } from "../../auth";
import { notFound } from "../../errors";

export const DEPOSIT_WINDOW_MIN = 30;
export const ACTIVE_STATUSES = ["awaiting_deposit", "funded", "paid", "disputed"] as const;
export const FINAL_STATUSES = ["released", "cancelled", "resolved", "blocked"] as const;

export type DealStatus = "awaiting_deposit" | "funded" | "paid" | "released" | "cancelled" | "disputed" | "resolved" | "blocked";

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
  status: DealStatus;
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

export const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .pipe(z.number().positive().max(1_000_000))
  .refine((n) => Math.round(n * 100) === n * 100, "Не більше 2 знаків після коми");

export const uuidSchema = z.string().uuid();

export const lockDeal = (db: Db, id: string) => one<DealRow>(db, `select * from deals where id = $1 for update`, [id]);
export const loadDeal = (db: Db, id: string) => one<DealRow>(db, `select * from deals where id = $1`, [id]);

/** Учасник має бачити угоду (перевірка через RLS — так само, як у БД). */
export async function getVisibleDeal(ctx: Ctx, actor: Actor, dealId: string): Promise<DealRow> {
  if (!uuidSchema.safeParse(dealId).success) throw notFound("Угоду не знайдено");
  const d = await asUser(ctx.db, actor.id, (tx) => loadDeal(tx, dealId));
  if (!d) throw notFound("Угоду не знайдено");
  return d;
}

export function roleIn(d: DealRow, actor: Actor): "buyer" | "seller" | "staff" | null {
  if (d.buyer_id === actor.id) return "buyer";
  if (d.seller_id === actor.id) return "seller";
  return isStaff(actor) ? "staff" : null;
}

/** Секунди між подіями; null, якщо даних немає або годинники сервера й блокчейну розійшлися (від'ємний інтервал). */
export function elapsed(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const s = (new Date(to).getTime() - new Date(from).getTime()) / 1000;
  return s >= 0 ? s : null;
}

export const systemMessage = (db: Db, dealId: string, body: string) =>
  db.query(`insert into deal_messages (deal_id, is_system, body) values ($1, true, $2)`, [dealId, body]);
