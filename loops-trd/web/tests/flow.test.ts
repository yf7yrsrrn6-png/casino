import { beforeEach, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { Db } from "@/server/db";
import { HttpError } from "@/server/errors";
import * as deals from "@/server/services/deals";
import * as chat from "@/server/services/chat";
import * as staff from "@/server/services/staff";
import * as identity from "@/server/services/identity";
import { createOffer } from "@/server/services/offers";
import { toUnits } from "@/server/chain";
import { ageDevices, createTestDb, createUser, makeCtx, meta, newOffer, signAction, siwe, type TestUser, FakeEscrow } from "./harness";

let db: Db;
let ctx: ReturnType<typeof makeCtx>;
let chain: FakeEscrow;
let seller: TestUser, buyer: TestUser, stranger: TestUser, mod: TestUser, admin: TestUser;
const sellerMeta = meta({ deviceHash: "seller-device-1", ip: "10.1.1.1" });
const buyerMeta = meta({ deviceHash: "buyer-device-1", ip: "10.2.2.2" });

const expectHttp = async (p: Promise<unknown>, status: number, re?: RegExp) => {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e, "очікувалась помилка").toBeInstanceOf(HttpError);
  expect((e as HttpError).status).toBe(status);
  if (re) expect((e as HttpError).message).toMatch(re);
};

beforeEach(async () => {
  ({ db } = await createTestDb());
  chain = new FakeEscrow();
  ctx = makeCtx(db, chain);
  seller = await createUser(db, { deals: 15, holder: "Олена Шевченко" });
  buyer = await createUser(db, { deals: 15, holder: "Іван Петренко" });
  stranger = await createUser(db, { deals: 15 });
  mod = await createUser(db, { role: "moderator" });
  admin = await createUser(db, { role: "admin" });
  // «Звичні» пристрої — щоб чиста угода мала низький ризик.
  await db.query(`insert into user_devices (user_id, device_hash, timezone) values ($1, 'seller-device-1', 'Europe/Kyiv'), ($2, 'buyer-device-1', 'Europe/Kyiv')`, [
    seller.actor.id,
    buyer.actor.id,
  ]);
  await ageDevices(db, seller.actor.id);
  await ageDevices(db, buyer.actor.id);
});

async function openDeal(amount = 100) {
  const offerId = await newOffer(db, seller.actor.id, { side: "sell" });
  return deals.createDeal(ctx, buyer.actor, buyerMeta, { offerId, amountUsdt: amount, paymentMethod: "Monobank" });
}

async function fund(d: { id: string; chain_deal_id: Hex; amount_usdt: string }) {
  await deals.getCreateSignature(ctx, seller.actor, d.id);
  chain.userCreateAndDeposit(d.chain_deal_id, seller.wallet, buyer.wallet, d.amount_usdt);
  return deals.syncDeal(ctx, d.id, seller.actor);
}

describe("Повний цикл угоди", () => {
  it("відгук → депозит → «Я оплатив» → перевірка → відпуск коштів", async () => {
    const d = await openDeal();
    expect(d).toMatchObject({ status: "awaiting_deposit", risk_level: "low", frozen: false, total_uah: "4150.00" });
    expect(d.seller_id).toBe(seller.actor.id);

    const funded = await fund(d);
    expect(funded.status).toBe("funded");
    expect(chain.calls).toContain(`sign:${d.chain_deal_id}:true`); // reviewRequired завжди true

    chain.now += 300;
    await deals.paidIntent(ctx, buyer.actor, buyerMeta, d.id, { senderName: "Петренко Іван" });
    chain.userMarkPaid(d.chain_deal_id);
    expect((await deals.syncDeal(ctx, d.id, buyer.actor)).status).toBe("paid");

    // Без серверного схвалення контракт не відпускає кошти.
    expect(() => chain.userConfirmRelease(d.chain_deal_id)).toThrow("ReviewPending");

    await new Promise((r) => setTimeout(r, 5));
    ctx.now = () => new Date(Date.now() + 5 * 60_000);
    const rel = await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: true, receivedInBank: true });
    expect(rel).toEqual({ status: "approved" });
    chain.userConfirmRelease(d.chain_deal_id);
    const done = await deals.syncDeal(ctx, d.id, seller.actor);
    expect(done.status).toBe("released");

    const { rows } = await db.query<{ successful_deals: number }>(`select successful_deals from profiles where id = $1`, [buyer.actor.id]);
    expect(rows[0].successful_deals).toBe(16);
    const ev = (await db.query<{ action: string; actor_wallet: string }>(`select action, actor_wallet from deal_events where deal_id = $1 order by id`, [d.id])).rows;
    expect(ev.map((e) => e.action)).toEqual(
      expect.arrayContaining(["deal.created", "deal.signature_issued", "chain.funded", "deal.paid_intent", "chain.paid", "deal.release_requested", "antifraud.release_approved", "chain.released"]),
    );
    expect(ev.find((e) => e.action === "deal.created")!.actor_wallet).toBe(buyer.wallet);
  });

  it("автоскасування: без депозиту за 30 хв — угода скасовується в БД", async () => {
    const d = await openDeal();
    ctx.now = () => new Date(Date.now() + 31 * 60_000);
    const r = await deals.keeperTick(ctx);
    expect(r.expiredBeforeDeposit).toBe(1);
    expect((await db.query<{ status: string }>(`select status from deals where id = $1`, [d.id])).rows[0].status).toBe("cancelled");
  });

  it("автоскасування: без оплати за 30 хв — кіпер викликає cancel у контракті, кошти повертаються", async () => {
    const d = await openDeal();
    await fund(d);
    chain.now += 31 * 60;
    const r = await deals.keeperTick(ctx);
    expect(r.cancelledOnChain).toBe(1);
    expect(chain.calls).toContain(`cancel:${d.chain_deal_id}`);
    expect((await db.query<{ status: string }>(`select status from deals where id = $1`, [d.id])).rows[0].status).toBe("cancelled");
  });

  it("кіпер не скасовує угоду з відкритим спором", async () => {
    const d = await openDeal();
    await fund(d);
    await deals.openDispute(ctx, buyer.actor, d.id, { reason: "Продавець не відповідає" });
    chain.now += 31 * 60;
    expect((await deals.keeperTick(ctx)).cancelledOnChain).toBe(0);
  });

  it("чат: сторони пишуть, сторонній — ні; після закриття номери карток маскуються", async () => {
    const d = await openDeal();
    await chat.postMessage(ctx, seller.actor, d.id, { body: "Карта 4441 1111 2222 3333, Олена" });
    await expectHttp(chat.postMessage(ctx, stranger.actor, d.id, { body: "привіт" }), 404);
    await expectHttp(chat.listMessages(ctx, stranger.actor, d.id), 404);
    const msgs = await chat.listMessages(ctx, buyer.actor, d.id);
    expect(msgs.some((m) => String(m.body).includes("4441 1111 2222 3333"))).toBe(true);
    // Покупець бачить ім'я продавця в чаті (з публічної картки, без реквізитів).
    expect(msgs.find((m) => m.sender_id === seller.actor.id)?.sender_name).toBe(seller.actor.display_name);

    await fund(d);
    await deals.paidIntent(ctx, buyer.actor, buyerMeta, d.id, { senderName: "Іван Петренко" });
    chain.userMarkPaid(d.chain_deal_id);
    await deals.syncDeal(ctx, d.id);
    ctx.now = () => new Date(Date.now() + 5 * 60_000);
    await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: true, receivedInBank: true });
    chain.userConfirmRelease(d.chain_deal_id);
    await deals.syncDeal(ctx, d.id);
    const after = await chat.listMessages(ctx, buyer.actor, d.id);
    expect(after.some((m) => String(m.body).includes("**** **** **** 3333"))).toBe(true);
    expect(after.some((m) => String(m.body).includes("4441 1111"))).toBe(false);
    await expectHttp(chat.postMessage(ctx, buyer.actor, d.id, { body: "ще" }), 403);
  });
});

describe("Антифрод у процесі угоди (клієнт не може обійти)", () => {
  it("перевищення ліміту — угода не створюється, підпис для контракту не видається", async () => {
    const offerId = await newOffer(db, seller.actor.id, { max: 100000 });
    const fresh = await createUser(db, { deals: 0 });
    await expectHttp(deals.createDeal(ctx, fresh.actor, meta(), { offerId, amountUsdt: 500, paymentMethod: "Monobank" }), 403, /разовий ліміт/);
    expect((await db.query(`select * from deals`)).rows).toHaveLength(0);
    const ra = (await db.query<{ decision: string; signals: { explanation: string }[] }>(`select decision, signals from risk_assessments`)).rows[0];
    expect(ra.decision).toBe("block");
    expect(ra.signals.some((s) => /разовий ліміт/.test(s.explanation))).toBe(true);
  });

  it("гаманець у чорному списку — блок без розкриття правила учаснику", async () => {
    await db.query(`insert into blacklist (kind, value, reason) values ('wallet', $1, 'шахрай')`, [buyer.wallet]);
    const offerId = await newOffer(db, seller.actor.id);
    await expectHttp(deals.createDeal(ctx, buyer.actor, buyerMeta, { offerId, amountUsdt: 50, paymentMethod: "Monobank" }), 403, /системою безпеки/);
  });

  it("пристрій у чорному списку (поточний запит)", async () => {
    await db.query(`insert into blacklist (kind, value, reason) values ('device', 'evil-device', 'мульти-акаунти')`);
    const offerId = await newOffer(db, seller.actor.id);
    await expectHttp(deals.createDeal(ctx, buyer.actor, meta({ deviceHash: "evil-device" }), { offerId, amountUsdt: 50, paymentMethod: "Monobank" }), 403);
  });

  it("AML high — блок", async () => {
    ctx = makeCtx(db, chain, { amlHigh: [buyer.wallet] });
    const offerId = await newOffer(db, seller.actor.id);
    await expectHttp(deals.createDeal(ctx, buyer.actor, buyerMeta, { offerId, amountUsdt: 50, paymentMethod: "Monobank" }), 403);
  });

  it("високий ризик: угода заморожена, продавець не отримає підпис до рішення адміна", async () => {
    const newbie = await createUser(db, { deals: 0, ageDays: 1 });
    await db.query(`update profiles set single_limit_override = 5000, daily_limit_override = 5000 where id = $1`, [newbie.actor.id]);
    const offerId = await newOffer(db, seller.actor.id);
    const d = await deals.createDeal(ctx, newbie.actor, meta({ deviceHash: "brand-new" }), { offerId, amountUsdt: 600, paymentMethod: "Monobank" });
    expect(d.frozen).toBe(true);
    expect(d.risk_level).toBe("high");
    await expectHttp(deals.getCreateSignature(ctx, seller.actor, d.id), 423);

    // Модератор не може розморозити; адмін — лише з підписом гаманця.
    await expectHttp(staff.adminDecideFrozen(ctx, mod.actor, d.id, { decision: "allow", note: "ок" }, undefined), 403);
    await expectHttp(staff.adminDecideFrozen(ctx, admin.actor, d.id, { decision: "allow", note: "ок" }, undefined), 428);
    const signed = await signAction(ctx, admin, "deal.frozen_decision", { dealId: d.id, decision: "allow", note: "перевірено" });
    await staff.adminDecideFrozen(ctx, admin.actor, d.id, { decision: "allow", note: "перевірено" }, signed);
    const sig = await deals.getCreateSignature(ctx, seller.actor, d.id);
    expect(sig.reviewRequired).toBe(true);
    // Після ручного дозволу відпуск усе одно потребує перевірки персоналом.
    expect((await db.query<{ release_check: string }>(`select release_check from deals where id = $1`, [d.id])).rows[0].release_check).toBe("staff");
  });

  it("невідповідність імені + чужий пристрій → заморозка в контракті при «Я оплатив»", async () => {
    const d = await openDeal();
    await fund(d);
    await db.query(`insert into user_devices (user_id, device_hash) values ($1, 'buyer-device-1')`, [stranger.actor.id]);
    chain.now += 300;
    const r = await deals.paidIntent(ctx, buyer.actor, buyerMeta, d.id, { senderName: "Сидір Ковпак" });
    expect(r.mismatch).toBe(true);
    chain.userMarkPaid(d.chain_deal_id);
    const after = await deals.syncDeal(ctx, d.id, buyer.actor);
    expect(after.frozen).toBe(true);
    expect(chain.calls).toContain(`freeze:${d.chain_deal_id}`);
    // Ескроу не відпускає кошти навіть якщо продавець спробує напряму в контракті.
    expect(() => chain.userConfirmRelease(d.chain_deal_id)).toThrow();
    expect(await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: true, receivedInBank: true })).toEqual({ status: "frozen" });
    const ra = (await db.query<{ signals: { code: string }[] }>(`select signals from risk_assessments where deal_id = $1 and stage = 'paid'`, [d.id])).rows[0];
    expect(ra.signals.map((s) => s.code)).toEqual(expect.arrayContaining(["sender_name_mismatch", "device_shared", "combo:shared_device_name_mismatch"]));
  });

  it("середній ризик → потрібен підпис продавця гаманцем; чужий підпис не приймається", async () => {
    const d = await openDeal();
    await fund(d);
    await deals.paidIntent(ctx, buyer.actor, buyerMeta, d.id, { senderName: "Іван Петренко" });
    chain.userMarkPaid(d.chain_deal_id);
    await deals.syncDeal(ctx, d.id);
    ctx.now = () => new Date(Date.now() + 5 * 60_000);
    // Продавець повідомляє, що ім'я в банку інше → сигнал 40 балів = середній ризик.
    const r = await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: false, receivedInBank: true });
    expect(r.status).toBe("needs_signature");
    if (r.status !== "needs_signature") return;
    expect(() => chain.userConfirmRelease(d.chain_deal_id)).toThrow("ReviewPending");

    await expectHttp(deals.confirmReleaseSignature(ctx, seller.actor, d.id, { nonce: r.nonce, signature: await stranger.sign(r.message) }), 403);
    // nonce використано — потрібен новий
    const r2 = await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: false, receivedInBank: true });
    if (r2.status !== "needs_signature") throw new Error(r2.status);
    expect(await deals.confirmReleaseSignature(ctx, seller.actor, d.id, { nonce: r2.nonce, signature: await seller.sign(r2.message) })).toEqual({ status: "approved" });
    chain.userConfirmRelease(d.chain_deal_id);
    expect((await deals.syncDeal(ctx, d.id)).status).toBe("released");
  });

  it("середній ризик у режимі «staff» — підтверджує модератор, але відпускає лише продавець", async () => {
    await db.query(`insert into antifraud_settings (key, value) values ('config', '{"mediumAction":"staff"}')`);
    const d = await openDeal();
    await fund(d);
    await deals.paidIntent(ctx, buyer.actor, buyerMeta, d.id, { senderName: "Іван Петренко" });
    chain.userMarkPaid(d.chain_deal_id);
    await deals.syncDeal(ctx, d.id);
    ctx.now = () => new Date(Date.now() + 5 * 60_000);
    expect((await deals.requestRelease(ctx, seller.actor, sellerMeta, d.id, { senderNameMatches: false, receivedInBank: true })).status).toBe("needs_staff");
    await expectHttp(deals.staffApproveRelease(ctx, buyer.actor, d.id, "я сам"), 403);
    await deals.staffApproveRelease(ctx, mod.actor, d.id, "Перевірив виписку в чаті");
    expect(chain.deals.get(d.chain_deal_id)!.status).toBe("Paid"); // модератор нічого не відпустив
    chain.userConfirmRelease(d.chain_deal_id);
    expect((await deals.syncDeal(ctx, d.id)).status).toBe("released");
  });
});

describe("Права доступу на сервері", () => {
  it("учасник не бачить чужих угод і не може діяти в них", async () => {
    const d = await openDeal();
    await expectHttp(deals.getDealView(ctx, stranger.actor, d.id), 404);
    await expectHttp(deals.getCreateSignature(ctx, stranger.actor, d.id), 404);
    await expectHttp(deals.openDispute(ctx, stranger.actor, d.id, { reason: "хочу спір" }), 404);
    expect(await deals.listMyDeals(ctx, stranger.actor, { status: "all", role: "all" })).toHaveLength(0);
    expect(await deals.listMyDeals(ctx, buyer.actor, { status: "all", role: "all" })).toHaveLength(1);
  });

  it("покупець не може отримати підпис депозиту чи відпустити кошти", async () => {
    const d = await openDeal();
    await expectHttp(deals.getCreateSignature(ctx, buyer.actor, d.id), 403);
    await fund(d);
    await expectHttp(deals.requestRelease(ctx, buyer.actor, buyerMeta, d.id, { senderNameMatches: true, receivedInBank: true }), 403);
  });

  it("модератор не може відпустити кошти, вирішити спір, керувати учасниками", async () => {
    const d = await openDeal();
    await fund(d);
    await expectHttp(deals.requestRelease(ctx, mod.actor, meta(), d.id, { senderNameMatches: true, receivedInBank: true }), 403);
    await expectHttp(staff.recordResolution(ctx, mod.actor, d.id, { txHash: "0x" + "1".repeat(64), note: "рішення" }), 403);
    await expectHttp(identity.adminUserAction(ctx, mod.actor, buyer.actor.id, { action: "block", reason: "тест" }, undefined), 403);
    await expectHttp(staff.updateAntifraudConfig(ctx, mod.actor, {}, undefined), 403);
    await expectHttp(staff.dashboard(ctx, mod.actor), 403);
    // а бачити угоду й чат — може
    expect((await deals.getDealView(ctx, mod.actor, d.id)).role).toBe("staff");
  });

  it("модератор дає рекомендацію, адмін вирішує спір транзакцією з гаманця", async () => {
    const d = await openDeal();
    await fund(d);
    await deals.openDispute(ctx, buyer.actor, d.id, { reason: "Оплатив, продавець не підтверджує" });
    chain.userOpenDispute(d.chain_deal_id);
    expect((await deals.syncDeal(ctx, d.id, buyer.actor)).status).toBe("disputed");
    await staff.recommend(ctx, mod.actor, d.id, { recommendation: "Виписка покупця справжня", toBuyer: 100 });
    // поки адмін не виконав resolveDispute у контракті — сервер нічого не запише
    await expectHttp(staff.recordResolution(ctx, admin.actor, d.id, { txHash: "0x" + "2".repeat(64), note: "На користь покупця" }), 400);
    chain.adminResolve(d.chain_deal_id, toUnits(100));
    await staff.recordResolution(ctx, admin.actor, d.id, { txHash: "0x" + "2".repeat(64), note: "На користь покупця" });
    const ds = (await db.query<{ status: string; resolution_to_buyer: string }>(`select status, resolution_to_buyer from disputes where deal_id = $1`, [d.id])).rows[0];
    expect(ds).toMatchObject({ status: "resolved", resolution_to_buyer: "100.00" });
    const lost = (await db.query<{ disputes_lost: number }>(`select disputes_lost from profiles where id = $1`, [seller.actor.id])).rows[0];
    expect(lost.disputes_lost).toBe(1);
    await staff.labelDispute(ctx, admin.actor, d.id, { label: "fraud" });
    await expectHttp(staff.labelDispute(ctx, mod.actor, d.id, { label: "honest" }), 403);
  });

  it("критичні дії адміна вимагають підпису саме його гаманця і саме цих даних", async () => {
    const target = await createUser(db, { status: "pending" });
    await expectHttp(identity.adminUserAction(ctx, admin.actor, target.actor.id, { action: "approve" }, undefined), 428);
    // підпис іншого гаманця
    const ch = await identity.createActionChallenge(ctx, admin.actor, "user.approve", { userId: target.actor.id, action: "approve" });
    await expectHttp(identity.adminUserAction(ctx, admin.actor, target.actor.id, { action: "approve" }, { nonce: ch.nonce, signature: await stranger.sign(ch.message) }), 403);
    // підпис на іншу дію
    const wrong = await signAction(ctx, admin, "user.block", { userId: target.actor.id, action: "block", reason: "x" });
    await expectHttp(identity.adminUserAction(ctx, admin.actor, target.actor.id, { action: "approve" }, wrong), 403);
    // правильний
    const ok = await signAction(ctx, admin, "user.approve", { userId: target.actor.id, action: "approve" });
    await identity.adminUserAction(ctx, admin.actor, target.actor.id, { action: "approve" }, ok);
    // повторне використання nonce
    await expectHttp(identity.adminUserAction(ctx, admin.actor, target.actor.id, { action: "approve" }, ok), 403);
    const log = (await db.query<{ action: string; signature: string }>(`select action, signature from staff_actions where target_id = $1`, [target.actor.id])).rows;
    expect(log).toEqual([{ action: "user.approve", signature: ok.signature }]);
  });

  it("адмін не може змінити власну роль/статус", async () => {
    const s = await signAction(ctx, admin, "user.set_role", { userId: admin.actor.id, action: "set_role", role: "member" });
    await expectHttp(identity.adminUserAction(ctx, admin.actor, admin.actor.id, { action: "set_role", role: "member" }, s), 403);
  });

  it("непідтверджений учасник не може створювати оголошення та угоди", async () => {
    const p = await createUser(db, { status: "pending" });
    await expectHttp(createOffer(ctx, p.actor, { side: "sell", price_uah: 41, min_usdt: 10, max_usdt: 20, payment_methods: ["Monobank"], terms: "" }), 403);
    const offerId = await newOffer(db, seller.actor.id);
    await expectHttp(deals.createDeal(ctx, p.actor, meta(), { offerId, amountUsdt: 50, paymentMethod: "Monobank" }), 403);
  });

  it("не можна відгукнутися на своє оголошення; сума в межах; спосіб оплати з оголошення", async () => {
    const offerId = await newOffer(db, seller.actor.id, { min: 20, max: 200 });
    await expectHttp(deals.createDeal(ctx, seller.actor, sellerMeta, { offerId, amountUsdt: 50, paymentMethod: "Monobank" }), 400);
    await expectHttp(deals.createDeal(ctx, buyer.actor, buyerMeta, { offerId, amountUsdt: 5, paymentMethod: "Monobank" }), 400);
    await expectHttp(deals.createDeal(ctx, buyer.actor, buyerMeta, { offerId, amountUsdt: 50, paymentMethod: "Готівка" }), 400);
  });
});

describe("Вхід: SIWE + інвайт-коди", () => {
  const login = async (u: TestUser, inviteCode?: string, domain = "loops.test") => {
    const { nonce } = await identity.createLoginNonce(ctx, u.wallet);
    const message = await siwe(u, nonce, domain);
    return identity.loginWithSiwe(ctx, { message, signature: await u.sign(message), inviteCode }, meta());
  };
  const fresh = async () => {
    const u = await createUser(db);
    await db.query(`delete from profiles where id = $1`, [u.actor.id]);
    return u;
  };

  it("новий гаманець без інвайту — відмова; з дійсним інвайтом — профіль «Очікує»", async () => {
    const u = await fresh();
    await expectHttp(login(u), 403, /інвайт/);
    const inv = await identity.createInvite(ctx, admin.actor, { days: 3 });
    const a = await login(u, inv.code);
    expect(a.status).toBe("pending");
    expect(a.wallet_address).toBe(u.wallet);
    // інвайт одноразовий
    const u2 = await fresh();
    await expectHttp(login(u2, inv.code), 403, /недійсний/);
  });

  it("прострочений і відкликаний інвайт не працюють", async () => {
    const inv = await identity.createInvite(ctx, admin.actor, { days: 1 });
    await db.query(`update invite_codes set expires_at = now() - interval '1 minute' where id = $1`, [inv.id]);
    await expectHttp(login(await fresh(), inv.code), 403);
    const inv2 = await identity.createInvite(ctx, admin.actor, { days: 1 });
    await identity.revokeInvite(ctx, admin.actor, inv2.id);
    await expectHttp(login(await fresh(), inv2.code), 403);
  });

  it("підпис іншим гаманцем, чужий домен, повторний nonce — відмова", async () => {
    const { nonce } = await identity.createLoginNonce(ctx, seller.wallet);
    const message = await siwe(seller, nonce);
    await expectHttp(identity.loginWithSiwe(ctx, { message, signature: await buyer.sign(message) }, meta()), 401);
    await expectHttp(login(seller, undefined, "evil.example"), 400, /домен/);
    const sig = await seller.sign(message);
    await identity.loginWithSiwe(ctx, { message, signature: sig }, meta());
    await expectHttp(identity.loginWithSiwe(ctx, { message, signature: sig }, meta()), 401, /Nonce/);
  });

  it("заблокований учасник не може увійти", async () => {
    await db.query(`update profiles set status = 'blocked' where id = $1`, [stranger.actor.id]);
    await expectHttp(login(stranger), 403, /заблоковано/);
  });

  it("перший адмін з BOOTSTRAP_ADMIN_WALLET — без інвайту, лише якщо адмінів ще немає", async () => {
    const u = await fresh();
    ctx.bootstrapAdminWallet = u.wallet;
    await expectHttp(login(u), 403); // адмін уже існує
    await db.query(`update profiles set role = 'member' where role = 'admin'`);
    const a = await login(u);
    expect(a).toMatchObject({ role: "admin", status: "approved" });
  });

  it("зміна гаманця — лише з підписом нового гаманця і схваленням адміна", async () => {
    const nu = await fresh();
    const message = identity.walletChangeMessage(buyer.actor.id, nu.wallet);
    await expectHttp(
      identity.requestChange(ctx, buyer.actor, { kind: "wallet", wallet_address: nu.wallet, message, signature: await stranger.sign(message) }),
      400,
    );
    await identity.requestChange(ctx, buyer.actor, { kind: "wallet", wallet_address: nu.wallet, message, signature: await nu.sign(message) });
    expect((await db.query<{ wallet_address: string }>(`select wallet_address from profiles where id = $1`, [buyer.actor.id])).rows[0].wallet_address).toBe(buyer.wallet);
    const req = (await db.query<{ id: string }>(`select id from change_requests where user_id = $1`, [buyer.actor.id])).rows[0];
    const s = await signAction(ctx, admin, "change_request.review", { requestId: req.id, approve: true });
    await identity.reviewChangeRequest(ctx, admin.actor, req.id, { approve: true }, s);
    expect((await db.query<{ wallet_address: string }>(`select wallet_address from profiles where id = $1`, [buyer.actor.id])).rows[0].wallet_address).toBe(nu.wallet);
  });

  it("зміна картки після схвалення — лише через запит", async () => {
    await identity.completeProfile(ctx, buyer.actor, { display_name: "Новий", telegram: "@new_name", card_holder_name: "Хтось Інший", card_last4: "0000" });
    const p = (await db.query<{ card_last4: string; display_name: string }>(`select card_last4, display_name from profiles where id = $1`, [buyer.actor.id])).rows[0];
    expect(p).toEqual({ card_last4: buyer.actor.id ? p.card_last4 : "", display_name: "Новий" });
    expect(p.card_last4).not.toBe("0000");
  });
});
