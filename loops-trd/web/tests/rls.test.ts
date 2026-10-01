import { beforeAll, describe, expect, it } from "vitest";
import { asUser, type Db } from "@/server/db";
import { createTestDb, createUser, newOffer, type TestUser } from "./harness";

/**
 * Тести прав доступу на рівні БД (RLS) — працюють навіть якщо хтось обійде API
 * і звернеться до Supabase напряму з JWT учасника.
 */
describe("RLS: права доступу в базі даних", () => {
  let db: Db;
  let alice: TestUser, bob: TestUser, carol: TestUser, mod: TestUser, admin: TestUser, pending: TestUser;
  let dealAB: string;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    alice = await createUser(db);
    bob = await createUser(db);
    carol = await createUser(db);
    mod = await createUser(db, { role: "moderator" });
    admin = await createUser(db, { role: "admin" });
    pending = await createUser(db, { status: "pending" });
    const offer = await newOffer(db, alice.actor.id);
    const { rows } = await db.query<{ id: string }>(
      `insert into deals (chain_deal_id, offer_id, seller_id, buyer_id, seller_wallet, buyer_wallet, amount_usdt, price_uah, total_uah, payment_method)
       values ($1, $2, $3, $4, $5, $6, 50, 41.5, 2075, 'Monobank') returning id`,
      ["0x" + "ab".repeat(32), offer, alice.actor.id, bob.actor.id, alice.wallet, bob.wallet],
    );
    dealAB = rows[0].id;
    await db.query(`insert into deal_messages (deal_id, sender_id, body) values ($1, $2, 'привіт')`, [dealAB, alice.actor.id]);
    await db.query(`insert into deal_events (deal_id, actor_id, action) values ($1, $2, 'deal.created')`, [dealAB, bob.actor.id]);
    await db.query(`insert into disputes (deal_id, opened_by, reason) values ($1, $2, 'не прийшли кошти')`, [dealAB, bob.actor.id]);
    await db.query(`insert into risk_assessments (user_id, deal_id, stage, score, level, decision) values ($1, $2, 'create', 10, 'low', 'allow')`, [
      bob.actor.id,
      dealAB,
    ]);
    await db.query(`insert into notifications (user_id, kind, title) values ($1, 'x', 'для Аліси')`, [alice.actor.id]);
    await db.query(`insert into staff_actions (actor_id, action) values ($1, 'admin.secret')`, [admin.actor.id]);
    await db.query(`insert into staff_actions (actor_id, action) values ($1, 'mod.own')`, [mod.actor.id]);
    await db.query(`insert into invite_codes (code_hash, code_hint, expires_at) values ('h', 'XXXX', now() + interval '1 day')`);
    await db.query(`insert into auth_nonces (nonce, purpose, expires_at) values ('n1', 'login', now() + interval '1 hour')`);
  });

  const count = (u: TestUser, sql: string, params: unknown[] = []) =>
    asUser(db, u.actor.id, async (tx) => Number((await tx.query<{ c: string }>(`select count(*) as c from (${sql}) q`, params)).rows[0].c));

  describe("учасник не бачить чужих угод", () => {
    it("сторони бачать угоду, сторонній — ні", async () => {
      expect(await count(alice, `select * from deals`)).toBe(1);
      expect(await count(bob, `select * from deals`)).toBe(1);
      expect(await count(carol, `select * from deals`)).toBe(0);
    });
    it("чат, журнал і спори чужої угоди недоступні", async () => {
      for (const t of ["deal_messages", "deal_events", "disputes"]) {
        expect(await count(carol, `select * from ${t}`), t).toBe(0);
        expect(await count(alice, `select * from ${t}`), t).toBe(1);
      }
    });
    it("сторонній не може написати в чат чужої угоди", async () => {
      await expect(
        asUser(db, carol.actor.id, (tx) => tx.query(`insert into deal_messages (deal_id, sender_id, body) values ($1, $2, 'спам')`, [dealAB, carol.actor.id])),
      ).rejects.toThrow(/row-level security/);
    });
    it("не можна писати від імені іншого", async () => {
      await expect(
        asUser(db, bob.actor.id, (tx) => tx.query(`insert into deal_messages (deal_id, sender_id, body) values ($1, $2, 'фейк')`, [dealAB, alice.actor.id])),
      ).rejects.toThrow(/row-level security/);
    });
    it("учасник не може змінити статус угоди напряму", async () => {
      await expect(asUser(db, bob.actor.id, (tx) => tx.query(`update deals set status = 'released' where id = $1`, [dealAB]))).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(db, bob.actor.id, (tx) => tx.query(`update deals set frozen = false`))).rejects.toThrow(/permission denied/);
    });
    it("учасник не може створити угоду в обхід сервера (і антифроду)", async () => {
      await expect(
        asUser(db, bob.actor.id, (tx) =>
          tx.query(
            `insert into deals (chain_deal_id, seller_id, buyer_id, seller_wallet, buyer_wallet, amount_usdt, price_uah, total_uah, payment_method)
             values ($1, $2, $3, 'a', 'b', 1, 1, 1, 'x')`,
            ["0x" + "cd".repeat(32), alice.actor.id, bob.actor.id],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("профілі та реквізити", () => {
    it("учасник бачить лише свій профіль", async () => {
      expect(await count(alice, `select * from profiles`)).toBe(1);
      expect(await count(alice, `select * from profiles where id = $1`, [bob.actor.id])).toBe(0);
    });
    it("публічна картка не містить реквізитів", async () => {
      const cols = await asUser(db, alice.actor.id, async (tx) => Object.keys((await tx.query(`select * from public_profiles limit 1`)).rows[0]));
      expect(cols).not.toContain("card_last4");
      expect(cols).not.toContain("card_holder_name");
      expect(cols).not.toContain("telegram");
      expect(cols).not.toContain("wallet_address");
    });
    it("учасник не може сам себе схвалити чи підвищити роль", async () => {
      await expect(asUser(db, pending.actor.id, (tx) => tx.query(`update profiles set status = 'approved' where id = $1`, [pending.actor.id]))).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(db, alice.actor.id, (tx) => tx.query(`update profiles set role = 'admin' where id = $1`, [alice.actor.id]))).rejects.toThrow(
        /permission denied/,
      );
    });
    it("персонал бачить усіх", async () => {
      expect(await count(mod, `select * from profiles`)).toBe(6);
      expect(await count(admin, `select * from profiles`)).toBe(6);
    });
  });

  describe("оголошення", () => {
    it("учасник не може створити оголошення від імені іншого", async () => {
      await expect(
        asUser(db, bob.actor.id, (tx) =>
          tx.query(`insert into offers (user_id, side, price_uah, min_usdt, max_usdt, payment_methods) values ($1, 'sell', 40, 1, 2, '{Monobank}')`, [
            alice.actor.id,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
    it("непідтверджений учасник не може створювати оголошення і не бачить ринок", async () => {
      await expect(
        asUser(db, pending.actor.id, (tx) =>
          tx.query(`insert into offers (user_id, side, price_uah, min_usdt, max_usdt, payment_methods) values ($1, 'sell', 40, 1, 2, '{Monobank}')`, [
            pending.actor.id,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      expect(await count(pending, `select * from offers`)).toBe(0);
    });
    it("учасник не може змінити чуже оголошення", async () => {
      const r = await asUser(db, bob.actor.id, (tx) => tx.query(`update offers set is_active = false where user_id = $1 returning id`, [alice.actor.id]));
      expect(r.rows).toHaveLength(0);
    });
  });

  describe("антифрод і службові дані", () => {
    it("учасник не бачить сигналів ризику, налаштувань, чорного списку, графа", async () => {
      for (const t of ["risk_assessments", "antifraud_settings", "blacklist", "user_devices", "user_ips", "card_history", "wallet_history"]) {
        expect(await count(bob, `select * from ${t}`), t).toBe(0);
      }
      expect(await count(mod, `select * from risk_assessments`)).toBe(1);
    });
    it("інвайти бачить лише адмін; nonce — ніхто", async () => {
      expect(await count(alice, `select * from invite_codes`)).toBe(0);
      expect(await count(mod, `select * from invite_codes`)).toBe(0);
      expect(await count(admin, `select * from invite_codes`)).toBe(1);
      await expect(count(admin, `select * from auth_nonces`)).rejects.toThrow(/permission denied/);
    });
    it("сповіщення — лише власні", async () => {
      expect(await count(alice, `select * from notifications`)).toBe(1);
      expect(await count(bob, `select * from notifications`)).toBe(0);
    });
    it("журнал персоналу: модератор бачить лише свої дії, адмін — усі, учасник — нічого", async () => {
      expect(await count(alice, `select * from staff_actions`)).toBe(0);
      expect(await count(mod, `select * from staff_actions`)).toBe(1);
      expect(await count(admin, `select * from staff_actions`)).toBe(2);
    });
    it("модератор не може змінювати угоди чи вирішувати спори напряму", async () => {
      await expect(asUser(db, mod.actor.id, (tx) => tx.query(`update deals set status = 'resolved'`))).rejects.toThrow(/permission denied/);
      await expect(asUser(db, mod.actor.id, (tx) => tx.query(`update disputes set status = 'resolved'`))).rejects.toThrow(/permission denied/);
    });
  });

  it("анонім без JWT нічого не бачить", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.query("set local role authenticated");
      return Number((await tx.query<{ c: string }>(`select count(*) as c from deals`)).rows[0].c);
    });
    expect(r).toBe(0);
  });

  it("заблокований модератор втрачає права персоналу", async () => {
    const m2 = await createUser(db, { role: "moderator", status: "blocked" });
    expect(await count(m2, `select * from deals`)).toBe(0);
  });
});
