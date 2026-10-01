import { route } from "@/server/http";
import { getActor } from "@/server/auth";
import { getMyProfile } from "@/server/services/identity";

/** Поточний користувач (або null) + профіль, ліміти, рейтинг. */
export const GET = route(async ({ req, ctx }) => {
  const actor = await getActor(req, ctx.db);
  if (!actor) return { actor: null };
  const tg = await ctx.db.query(`select 1 from telegram_links where user_id = $1`, [actor.id]);
  return { actor, ...(await getMyProfile(ctx, actor)), telegram: tg.rows.length > 0 };
});
