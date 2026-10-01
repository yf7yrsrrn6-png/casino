import type { Ctx } from "./context";
import { asUser } from "../db";
import type { Actor } from "../auth";

export async function listNotifications(ctx: Ctx, actor: Actor) {
  return asUser(ctx.db, actor.id, async (tx) => ({
    items: (await tx.query(`select * from notifications where user_id = $1 order by created_at desc limit 100`, [actor.id])).rows,
    unread: Number(
      (await tx.query<{ c: string }>(`select count(*) as c from notifications where user_id = $1 and read_at is null`, [actor.id])).rows[0].c,
    ),
  }));
}

export async function markAllRead(ctx: Ctx, actor: Actor) {
  await asUser(ctx.db, actor.id, (tx) => tx.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [actor.id]));
}
