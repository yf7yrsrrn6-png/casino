import type { Db } from "./db";
import type { Actor } from "./auth";

export async function logDealEvent(
  db: Db,
  dealId: string,
  actor: Pick<Actor, "id" | "wallet_address"> | null,
  action: string,
  details: Record<string, unknown> = {},
  txHash?: string | null,
) {
  await db.query(
    `insert into deal_events (deal_id, actor_id, actor_wallet, action, details, tx_hash)
     values ($1, $2, $3, $4, $5, $6)`,
    [dealId, actor?.id ?? null, actor?.wallet_address ?? "system", action, JSON.stringify(details), txHash ?? null],
  );
}

export async function logStaffAction(
  db: Db,
  actor: Actor,
  action: string,
  target: { type: string; id: string } | null,
  details: Record<string, unknown> = {},
  signature?: string | null,
) {
  await db.query(
    `insert into staff_actions (actor_id, actor_wallet, actor_role, action, target_type, target_id, details, signature)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor.id,
      actor.wallet_address,
      actor.role,
      action,
      target?.type ?? null,
      target?.id ?? null,
      JSON.stringify(details),
      signature ?? null,
    ],
  );
}

export async function notify(
  db: Db,
  userId: string,
  kind: string,
  title: string,
  body?: string | null,
  link?: string | null,
) {
  await db.query(`insert into notifications (user_id, kind, title, body, link) values ($1, $2, $3, $4, $5)`, [
    userId,
    kind,
    title,
    body ?? null,
    link ?? null,
  ]);
}

export async function notifyStaff(db: Db, kind: string, title: string, body?: string, link?: string, adminsOnly = false) {
  await db.query(
    `insert into notifications (user_id, kind, title, body, link)
     select id, $1, $2, $3, $4 from profiles
     where status = 'approved' and role = any($5::app_role[])`,
    [kind, title, body ?? null, link ?? null, adminsOnly ? ["admin"] : ["admin", "moderator"]],
  );
}
