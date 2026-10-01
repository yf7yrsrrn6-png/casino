import { createHash, randomBytes } from "crypto";
import { recoverMessageAddress, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { z } from "zod";
import type { Ctx } from "./context";
import { one, asUser, type Db } from "../db";
import type { Actor, RequestMeta, AppRole } from "../auth";
import { loadActor } from "../auth";
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from "../errors";
import { logStaffAction, notify, notifyStaff } from "../audit";
import { recordDevice } from "../antifraud/repository";
import { loadConfig } from "../antifraud/repository";
import { computeLimits } from "../antifraud/limits";

const NONCE_TTL_MIN = 10;
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Невірна адреса гаманця")
  .transform((s) => s.toLowerCase());

export const hashInvite = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

// ─── SIWE ────────────────────────────────────────────────────────────────

export async function createLoginNonce(ctx: Ctx, address: string) {
  const wallet = addressSchema.parse(address);
  const nonce = generateSiweNonce();
  await ctx.db.query(
    `insert into auth_nonces (nonce, purpose, wallet_address, expires_at) values ($1, 'login', $2, $3)`,
    [nonce, wallet, new Date(ctx.now().getTime() + NONCE_TTL_MIN * 60_000)],
  );
  return { nonce };
}

export const loginSchema = z.object({
  message: z.string().min(50).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  inviteCode: z.string().trim().max(64).optional(),
});

/**
 * Перевіряє SIWE-повідомлення та підпис. Новий гаманець → потрібен дійсний інвайт-код.
 * Повертає актора (статус може бути pending).
 */
export async function loginWithSiwe(ctx: Ctx, input: z.infer<typeof loginSchema>, meta: RequestMeta): Promise<Actor> {
  const msg = parseSiweMessage(input.message);
  if (!msg.address || !msg.nonce || !msg.domain || !msg.chainId) throw badRequest("Некоректне SIWE-повідомлення");
  if (msg.domain !== ctx.domain) throw badRequest(`Невірний домен у повідомленні (${msg.domain})`);
  if (msg.chainId !== ctx.chainId) throw badRequest("Невірна мережа: потрібна BNB Smart Chain Testnet");
  const now = ctx.now();
  if (msg.expirationTime && msg.expirationTime < now) throw badRequest("Повідомлення прострочене");
  if (msg.notBefore && msg.notBefore > now) throw badRequest("Повідомлення ще не дійсне");

  const wallet = msg.address.toLowerCase();
  const recovered = (
    await recoverMessageAddress({ message: input.message, signature: input.signature as Hex })
  ).toLowerCase();
  if (recovered !== wallet) throw unauthorized("Підпис не відповідає гаманцю");

  return ctx.db.transaction(async (tx) => {
    // Nonce одноразовий і прив'язаний до гаманця.
    const n = await one<{ nonce: string }>(
      tx,
      `update auth_nonces set used_at = now()
       where nonce = $1 and purpose = 'login' and wallet_address = $2 and used_at is null and expires_at > $3
       returning nonce`,
      [msg.nonce, wallet, now],
    );
    if (!n) throw unauthorized("Nonce недійсний або вже використаний — спробуйте ще раз");

    let profile = await one<{ id: string; status: string }>(tx, `select id, status from profiles where wallet_address = $1`, [wallet]);

    if (!profile) {
      const isBootstrap =
        ctx.bootstrapAdminWallet === wallet &&
        !(await one(tx, `select 1 from profiles where role = 'admin' limit 1`));
      if (isBootstrap) {
        profile = await one(
          tx,
          `insert into profiles (wallet_address, role, status, approved_at) values ($1, 'admin', 'approved', now())
           returning id, status`,
          [wallet],
        );
      } else {
        if (!input.inviteCode) throw new HttpError(403, "Новий гаманець: потрібен інвайт-код", "invite_required");
        const invite = await one<{ id: string }>(
          tx,
          `select id from invite_codes
           where code_hash = $1 and used_by is null and revoked_at is null and expires_at > $2
           for update`,
          [hashInvite(input.inviteCode), now],
        );
        if (!invite) throw forbidden("Інвайт-код недійсний, прострочений або вже використаний");
        profile = await one(tx, `insert into profiles (wallet_address) values ($1) returning id, status`, [wallet]);
        await tx.query(`update invite_codes set used_by = $1, used_at = now() where id = $2`, [profile!.id, invite.id]);
        await notifyStaff(tx, "new_member", "Нова заявка на вступ", `Гаманець ${wallet}`, "/admin/users", true);
      }
      await tx.query(`insert into wallet_history (user_id, wallet_address) values ($1, $2)`, [profile!.id, wallet]);
    }
    if (profile!.status === "blocked") throw forbidden("Обліковий запис заблоковано");
    await recordDevice(tx, profile!.id, meta, ctx.ipIntel);
    return (await loadActor(tx, profile!.id))!;
  });
}

// ─── Профіль ─────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  display_name: z.string().trim().min(2).max(40),
  telegram: z
    .string()
    .trim()
    .transform((s) => (s.startsWith("@") ? s : `@${s}`))
    .pipe(z.string().regex(/^@[A-Za-z0-9_]{5,32}$/, "Невірний Telegram-нікнейм")),
  card_holder_name: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[\p{L}\s'’ʼ.-]+$/u, "Ім'я власника картки: лише літери"),
  card_last4: z.string().regex(/^\d{4}$/, "Рівно 4 останні цифри картки"),
});

/** Перше заповнення профілю (до схвалення). Зміни картки після схвалення — лише через запит. */
export async function completeProfile(ctx: Ctx, actor: Actor, input: z.infer<typeof profileSchema>) {
  if (actor.status === "approved" || actor.profile_completed) {
    // Ім'я та Telegram можна змінювати вільно; картку — лише через запит на зміну.
    await ctx.db.query(`update profiles set display_name = $2, telegram = $3, updated_at = now() where id = $1`, [
      actor.id,
      input.display_name,
      input.telegram,
    ]);
    return;
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update profiles set display_name = $2, telegram = $3, card_holder_name = $4, card_last4 = $5,
         profile_completed = true, status = case when status = 'rejected' then 'pending'::verification_status else status end,
         updated_at = now()
       where id = $1`,
      [actor.id, input.display_name, input.telegram, input.card_holder_name, input.card_last4],
    );
    await tx.query(`insert into card_history (user_id, card_last4, card_holder_name) values ($1, $2, $3)`, [
      actor.id,
      input.card_last4,
      input.card_holder_name,
    ]);
  });
}

export async function getMyProfile(ctx: Ctx, actor: Actor) {
  const cfg = await loadConfig(ctx.db);
  const used = await one<{ v: string }>(
    ctx.db,
    `select coalesce(sum(amount_usdt), 0) as v from deals
     where (buyer_id = $1 or seller_id = $1) and created_at > now() - interval '24 hours'
       and status not in ('cancelled', 'blocked')`,
    [actor.id],
  );
  return asUser(ctx.db, actor.id, async (tx) => {
    const profile = await one<Record<string, unknown> & { successful_deals: number; single_limit_override: string | null; daily_limit_override: string | null }>(
      tx,
      `select id, wallet_address, role, status, display_name, telegram, card_holder_name, card_last4, profile_completed,
              successful_deals, disputes_count, disputes_lost, status_reason, created_at, approved_at,
              single_limit_override, daily_limit_override
       from profiles where id = $1`,
      [actor.id],
    );
    const requests = (
      await tx.query(`select * from change_requests where user_id = $1 order by created_at desc limit 10`, [actor.id])
    ).rows;
    const limits = computeLimits(cfg.limits.tiers, profile!.successful_deals, {
      single: profile!.single_limit_override ? Number(profile!.single_limit_override) : null,
      daily: profile!.daily_limit_override ? Number(profile!.daily_limit_override) : null,
    });
    return { profile, requests, limits: { ...limits, usedToday: Number(used?.v ?? 0) }, rating: rating(profile!) };
  });
}

export function rating(p: { successful_deals?: unknown; disputes_lost?: unknown }) {
  const ok = Number(p.successful_deals ?? 0);
  const lost = Number(p.disputes_lost ?? 0);
  if (ok + lost === 0) return null;
  return Math.round((ok / (ok + lost)) * 1000) / 10;
}

// ─── Запити на зміну картки / гаманця ────────────────────────────────────

export const changeRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("card"),
    card_holder_name: profileSchema.shape.card_holder_name,
    card_last4: profileSchema.shape.card_last4,
  }),
  z.object({
    kind: z.literal("wallet"),
    wallet_address: addressSchema,
    /** Підпис нового гаманця — доказ володіння. */
    message: z.string().min(10).max(2000),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  }),
]);

export function walletChangeMessage(userId: string, newWallet: string) {
  return `Loops Trd: прив'язати цей гаманець до акаунта ${userId}\nГаманець: ${newWallet.toLowerCase()}`;
}

export async function requestChange(ctx: Ctx, actor: Actor, input: z.infer<typeof changeRequestSchema>) {
  if (actor.status !== "approved") throw forbidden("Зміни доступні після схвалення профілю");
  if (input.kind === "wallet") {
    if (input.message !== walletChangeMessage(actor.id, input.wallet_address)) throw badRequest("Невірний текст повідомлення");
    const rec = (await recoverMessageAddress({ message: input.message, signature: input.signature as Hex })).toLowerCase();
    if (rec !== input.wallet_address) throw badRequest("Підпис не від нового гаманця");
    if (await one(ctx.db, `select 1 from profiles where wallet_address = $1`, [input.wallet_address])) {
      throw conflict("Цей гаманець уже прив'язаний до іншого акаунта");
    }
  }
  const active = await one(
    ctx.db,
    `select 1 from deals where (buyer_id = $1 or seller_id = $1) and status in ('awaiting_deposit','funded','paid','disputed')`,
    [actor.id],
  );
  if (active) throw conflict("Спочатку завершіть активні угоди");
  try {
    await ctx.db.query(
      `insert into change_requests (user_id, kind, new_card_holder_name, new_card_last4, new_wallet_address)
       values ($1, $2, $3, $4, $5)`,
      [
        actor.id,
        input.kind,
        input.kind === "card" ? input.card_holder_name : null,
        input.kind === "card" ? input.card_last4 : null,
        input.kind === "wallet" ? input.wallet_address : null,
      ],
    );
  } catch (e) {
    if (String(e).includes("change_requests_one_pending")) throw conflict("Уже є запит на розгляді");
    throw e;
  }
  await notifyStaff(ctx.db, "change_request", "Запит на зміну " + (input.kind === "card" ? "картки" : "гаманця"), actor.display_name ?? actor.wallet_address, "/admin/users", true);
}

// ─── Підпис критичних дій гаманцем ───────────────────────────────────────

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

export function actionMessage(action: string, payload: unknown, nonce: string, issuedAt: string) {
  return [
    "Loops Trd — підтвердження дії",
    `Дія: ${action}`,
    `Дані: ${stable(payload)}`,
    `Nonce: ${nonce}`,
    `Час: ${issuedAt}`,
  ].join("\n");
}

export async function createActionChallenge(ctx: Ctx, actor: Actor, action: string, payload: unknown) {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = ctx.now().toISOString();
  await ctx.db.query(
    `insert into auth_nonces (nonce, purpose, wallet_address, payload, expires_at) values ($1, 'action', $2, $3, $4)`,
    [nonce, actor.wallet_address, JSON.stringify({ action, payload: stable(payload), issuedAt }), new Date(ctx.now().getTime() + NONCE_TTL_MIN * 60_000)],
  );
  return { nonce, message: actionMessage(action, payload, nonce, issuedAt) };
}

export const signedSchema = z.object({ nonce: z.string().regex(/^[0-9a-f]{32}$/), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

/** Перевіряє, що actor підписав саме цю дію з саме цими даними. Nonce одноразовий. */
export async function verifyActionSignature(
  db: Db,
  actor: Actor,
  action: string,
  payload: unknown,
  signed: { nonce?: string; signature?: string } | undefined,
): Promise<string> {
  const s = signedSchema.safeParse(signed ?? {});
  if (!s.success) throw new HttpError(428, "Потрібне підтвердження підписом гаманця", "signature_required");
  const row = await one<{ payload: { action: string; payload: string; issuedAt: string } }>(
    db,
    `update auth_nonces set used_at = now()
     where nonce = $1 and purpose = 'action' and wallet_address = $2 and used_at is null and expires_at > now()
     returning payload`,
    [s.data.nonce, actor.wallet_address],
  );
  if (!row) throw forbidden("Підтвердження недійсне або прострочене");
  if (row.payload.action !== action || row.payload.payload !== stable(payload)) throw forbidden("Підписані дані не збігаються з дією");
  const message = actionMessage(action, JSON.parse(row.payload.payload), s.data.nonce, row.payload.issuedAt);
  const rec = (await recoverMessageAddress({ message, signature: s.data.signature as Hex })).toLowerCase();
  if (rec !== actor.wallet_address) throw forbidden("Підпис не від вашого гаманця");
  return s.data.signature;
}

// ─── Адмін: учасники ─────────────────────────────────────────────────────

export async function createInvite(ctx: Ctx, actor: Actor, input: { days: number; note?: string }) {
  const days = Math.min(Math.max(Math.floor(input.days), 1), 30);
  const code = `LT-${randomBytes(6).toString("hex").toUpperCase()}`;
  const row = await one<{ id: string; expires_at: Date }>(
    ctx.db,
    `insert into invite_codes (code_hash, code_hint, note, created_by, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(days => $5)) returning id, expires_at`,
    [hashInvite(code), code.slice(-4), input.note ?? null, actor.id, days],
  );
  await logStaffAction(ctx.db, actor, "invite.create", { type: "invite", id: row!.id }, { days, note: input.note ?? null });
  // Код показується один раз; у БД зберігається лише хеш.
  return { id: row!.id, code, expires_at: row!.expires_at };
}

export async function revokeInvite(ctx: Ctx, actor: Actor, id: string) {
  const r = await one(ctx.db, `update invite_codes set revoked_at = now() where id = $1 and used_by is null and revoked_at is null returning id`, [id]);
  if (!r) throw notFound("Інвайт не знайдено або вже використаний");
  await logStaffAction(ctx.db, actor, "invite.revoke", { type: "invite", id });
}

export const userActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("block"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("set_role"), role: z.enum(["member", "moderator", "admin"]) }),
  z.object({
    action: z.literal("set_limits"),
    single: z.number().positive().max(1_000_000).nullable(),
    daily: z.number().positive().max(10_000_000).nullable(),
  }),
]);
export type UserAction = z.infer<typeof userActionSchema>;

/** Критичні дії адміна над учасником — лише з підписом гаманця. */
export async function adminUserAction(
  ctx: Ctx,
  actor: Actor,
  userId: string,
  input: UserAction,
  signed: { nonce?: string; signature?: string } | undefined,
) {
  if (actor.role !== "admin" || actor.status !== "approved") throw forbidden();
  const signature = await verifyActionSignature(ctx.db, actor, `user.${input.action}`, { userId, ...input }, signed);
  const target = await one<{ id: string; status: string; role: AppRole; profile_completed: boolean }>(
    ctx.db,
    `select id, status, role, profile_completed from profiles where id = $1`,
    [userId],
  );
  if (!target) throw notFound("Учасника не знайдено");
  if (target.id === actor.id && input.action !== "set_limits") throw forbidden("Не можна змінювати власний статус чи роль");

  await ctx.db.transaction(async (tx) => {
    switch (input.action) {
      case "approve":
        if (!target.profile_completed) throw badRequest("Профіль ще не заповнено");
        await tx.query(
          `update profiles set status = 'approved', status_reason = null, approved_at = now(), approved_by = $2, updated_at = now() where id = $1`,
          [userId, actor.id],
        );
        await notify(tx, userId, "verification", "Профіль підтверджено", "Ласкаво просимо до Loops Trd!", "/market");
        break;
      case "reject":
        await tx.query(`update profiles set status = 'rejected', status_reason = $2, updated_at = now() where id = $1`, [userId, input.reason]);
        await notify(tx, userId, "verification", "Заявку відхилено", input.reason, "/account");
        break;
      case "block":
        await tx.query(`update profiles set status = 'blocked', status_reason = $2, updated_at = now() where id = $1`, [userId, input.reason]);
        await tx.query(`update offers set is_active = false where user_id = $1`, [userId]);
        break;
      case "unblock":
        await tx.query(`update profiles set status = 'approved', status_reason = null, updated_at = now() where id = $1`, [userId]);
        break;
      case "set_role":
        await tx.query(`update profiles set role = $2, updated_at = now() where id = $1`, [userId, input.role]);
        break;
      case "set_limits":
        await tx.query(`update profiles set single_limit_override = $2, daily_limit_override = $3, updated_at = now() where id = $1`, [
          userId,
          input.single,
          input.daily,
        ]);
        break;
    }
    await logStaffAction(tx, actor, `user.${input.action}`, { type: "user", id: userId }, input, signature);
  });
}

export async function reviewChangeRequest(
  ctx: Ctx,
  actor: Actor,
  requestId: string,
  input: { approve: boolean; note?: string },
  signed: { nonce?: string; signature?: string } | undefined,
) {
  if (actor.role !== "admin" || actor.status !== "approved") throw forbidden();
  const signature = await verifyActionSignature(ctx.db, actor, "change_request.review", { requestId, ...input }, signed);
  await ctx.db.transaction(async (tx) => {
    const r = await one<{ id: string; user_id: string; kind: string; new_card_holder_name: string; new_card_last4: string; new_wallet_address: string }>(
      tx,
      `select * from change_requests where id = $1 and status = 'pending' for update`,
      [requestId],
    );
    if (!r) throw notFound("Запит не знайдено");
    await tx.query(`update change_requests set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 where id = $1`, [
      requestId,
      input.approve ? "approved" : "rejected",
      actor.id,
      input.note ?? null,
    ]);
    if (input.approve) {
      if (r.kind === "card") {
        await tx.query(`update profiles set card_holder_name = $2, card_last4 = $3, updated_at = now() where id = $1`, [
          r.user_id,
          r.new_card_holder_name,
          r.new_card_last4,
        ]);
        await tx.query(`insert into card_history (user_id, card_last4, card_holder_name) values ($1, $2, $3)`, [
          r.user_id,
          r.new_card_last4,
          r.new_card_holder_name,
        ]);
      } else {
        // Зміна гаманця анулює поточну сесію (wallet у JWT ≠ wallet у профілі).
        await tx.query(`update profiles set wallet_address = $2, updated_at = now() where id = $1`, [r.user_id, r.new_wallet_address]);
        await tx.query(`insert into wallet_history (user_id, wallet_address) values ($1, $2)`, [r.user_id, r.new_wallet_address]);
        await tx.query(`update offers set is_active = false where user_id = $1`, [r.user_id]);
      }
    }
    await notify(tx, r.user_id, "change_request", input.approve ? "Зміну схвалено" : "Зміну відхилено", input.note ?? null, "/account");
    await logStaffAction(tx, actor, "change_request.review", { type: "change_request", id: requestId }, input, signature);
  });
}
