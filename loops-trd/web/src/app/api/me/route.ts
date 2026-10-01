import { route } from "@/server/http";
import { getActor } from "@/server/auth";
import { getMyProfile } from "@/server/services/identity";

/** Поточний користувач (або null) + профіль, ліміти, рейтинг. */
export const GET = route(async ({ req, ctx }) => {
  const actor = await getActor(req, ctx.db);
  if (!actor) return { actor: null };
  return { actor, ...(await getMyProfile(ctx, actor)) };
});
