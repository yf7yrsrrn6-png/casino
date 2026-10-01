import { authed } from "@/server/http";
import { getVisibleDeal, syncDeal } from "@/server/services/deals";

/** Оновлює стан угоди з блокчейну. Клієнту не довіряємо — читаємо контракт. */
export const POST = authed({}, async ({ ctx, actor, params }) => {
  await getVisibleDeal(ctx, actor, params.id);
  return { deal: await syncDeal(ctx, params.id, actor) };
});
