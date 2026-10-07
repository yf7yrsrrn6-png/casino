/**
 * Наскрізна перевірка Loops Trd без моків:
 *   • локальний вузол Hardhat з chainId 97 + задеплоєні LoopsTrdEscrow і MockUSDT;
 *   • Postgres (PGlite через wire-протокол) з міграціями Supabase та RLS;
 *   • справжній `next start` (спершу `npm run build`);
 *   • повний сценарій через HTTP API і справжні транзакції в контракт.
 *
 * Запуск: npm run build && npm run e2e
 */
import fs from "fs";
import path from "path";
import { createWalletClient, http, parseEther, parseUnits, type Hex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { escrowAbi, mockUsdtAbi } from "../src/lib/abi";
import { CRON_SECRET, KEYS, ROOT, RPC, chain, killAll, pub, startStack } from "./stack";

const APP_PORT = 3100;
const BASE = `http://localhost:${APP_PORT}`;
const DEPLOYER = KEYS.deployer;
const ADMIN = KEYS.admin;

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
function check(cond: unknown, m: string) {
  if (cond) ok(m);
  else {
    failures++;
    console.log(`  ✗ ${m}`);
  }
}

class User {
  cookie = "";
  readonly account;
  readonly wallet;
  constructor(readonly name: string, readonly key: Hex = generatePrivateKey(), readonly device = `dev-${name}-${Math.random().toString(36).slice(2, 8)}`) {
    this.account = privateKeyToAccount(key);
    this.wallet = createWalletClient({ chain, transport: http(RPC), account: this.account });
  }
  get address() {
    return this.account.address.toLowerCase();
  }
  async api<T = Record<string, unknown>>(p: string, body?: unknown, method?: string): Promise<{ status: number; data: T }> {
    const res = await fetch(BASE + p, {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", cookie: this.cookie, "x-device-id": this.device, "x-timezone": "Europe/Kyiv", "x-forwarded-for": `10.9.${this.name.length}.${this.name.charCodeAt(0)}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set?.startsWith("lt_session=")) this.cookie = set.split(";")[0];
    return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
  }
  async login(inviteCode?: string) {
    const { data } = await this.api<{ nonce: string }>("/api/auth/nonce", { address: this.address });
    const message = createSiweMessage({ address: this.account.address, chainId: 97, domain: `localhost:${APP_PORT}`, nonce: data.nonce, uri: BASE, version: "1", issuedAt: new Date() });
    return this.api<{ actor: { status: string; role: string } }>("/api/auth/verify", { message, signature: await this.account.signMessage({ message }), inviteCode });
  }
  async signed(action: string, payload: unknown) {
    const { data } = await this.api<{ nonce: string; message: string }>("/api/challenge", { action, payload });
    return { nonce: data.nonce, signature: await this.account.signMessage({ message: data.message }) };
  }
  async tx(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
    const hash = await this.wallet.writeContract({ address, abi: abi as never, functionName: functionName as never, args: args as never, chain });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
    return hash;
  }
}

/** Імітуємо реальну паузу (покупець іде в банк і платить). */
async function wait(seconds: number) {
  await pub.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await pub.request({ method: "evm_mine" as never, params: [] as never });
}

async function main() {
  console.log("▶ Стенд: Postgres + Hardhat (chainId 97) + контракти + next start");
  const stack = await startStack({ port: APP_PORT });
  const ESCROW = stack.escrow;
  const USDT = stack.usdt;
  ok(`LoopsTrdEscrow ${ESCROW}, MockUSDT ${USDT}`);
  stopStack = stack.stop;

  // Учасники: газ від деплоєра
  const funder = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(DEPLOYER) });
  const admin = new User("admin", ADMIN);
  const alice = new User("alice");
  const bob = new User("bob");
  const carol = new User("carol");
  const mod = new User("mod");
  for (const u of [alice, bob, carol, mod]) {
    await pub.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: u.account.address, value: parseEther("10"), chain }) });
  }

  console.log("▶ Вхід, інвайти, верифікація");
  check((await admin.login()).data.actor?.role === "admin", "перший адмін входить без інвайту (BOOTSTRAP_ADMIN_WALLET)");
  check((await alice.login()).status === 403, "новий гаманець без інвайту — 403");
  const invites: string[] = [];
  for (let i = 0; i < 4; i++) invites.push((await admin.api<{ code: string }>("/api/admin/invites", { days: 2, note: `e2e ${i}` })).data.code);
  check((await alice.login(invites[0])).data.actor?.status === "pending", "Аліса входить з інвайтом → «Очікує підтвердження»");
  check((await bob.login(invites[0])).status === 403, "той самий інвайт вдруге — 403");
  await bob.login(invites[1]);
  await carol.login(invites[2]);
  await mod.login(invites[3]);
  check((await alice.api("/api/offers")).status === 403, "непідтверджена Аліса не бачить ринок");

  const profiles: [User, string, string][] = [
    [alice, "Аліса", "Аліса Коваль"],
    [bob, "Боб", "Богдан Бондар"],
    [carol, "Керол", "Кароліна Сич"],
    [mod, "Модератор", "Марко Мельник"],
  ];
  for (const [u, n, holder] of profiles) {
    await u.api("/api/me/profile", { display_name: n, telegram: `@${u.name}_e2e`, card_holder_name: holder, card_last4: String(1000 + u.name.length * 111).slice(-4) }, "PUT");
  }
  const users = (await admin.api<{ users: { id: string; wallet_address: string }[] }>("/api/admin/users")).data.users;
  const idOf = (u: User) => users.find((x) => x.wallet_address === u.address)!.id;
  const unsigned = await admin.api(`/api/admin/users/${idOf(alice)}`, { input: { action: "approve" } });
  check(unsigned.status === 428, "схвалення без підпису гаманцем — 428");
  for (const u of [alice, bob, carol, mod]) {
    const input = { action: "approve" };
    const signed = await admin.signed("user.approve", { userId: idOf(u), ...input });
    const r = await admin.api(`/api/admin/users/${idOf(u)}`, { input, signed });
    if (r.status !== 200) throw new Error(JSON.stringify(r.data));
  }
  ok("адмін схвалив 4 учасників з підписом гаманця");
  {
    const input = { action: "set_role", role: "moderator" };
    const signed = await admin.signed("user.set_role", { userId: idOf(mod), ...input });
    check((await admin.api(`/api/admin/users/${idOf(mod)}`, { input, signed })).status === 200, "призначено модератора");
  }

  console.log("▶ Оголошення й угода");
  const offer = await alice.api<{ offer: { id: string } }>("/api/offers", { side: "sell", price_uah: 41.5, min_usdt: 10, max_usdt: 90, payment_methods: ["Monobank"], terms: "" });
  check(offer.status === 200, "Аліса створила оголошення на продаж");
  check(((await bob.api<{ offers: unknown[] }>("/api/offers?side=sell")).data.offers ?? []).length === 1, "Боб бачить оголошення на ринку");
  const over = await bob.api("/api/deals", { offerId: offer.data.offer.id, amountUsdt: 95, paymentMethod: "Monobank" });
  check(over.status === 400, "сума поза межами оголошення — 400");
  const created = await bob.api<{ deal: { id: string; risk_level: string; frozen: boolean } }>("/api/deals", { offerId: offer.data.offer.id, amountUsdt: 50, paymentMethod: "Monobank" });
  check(created.status === 200, `Боб відгукнувся: угода на 50 USDT (ризик: ${created.data.deal?.risk_level})`);
  if (created.data.deal.frozen || created.data.deal.risk_level !== "low") {
    const qd = (await admin.api<{ queue: { signals: { explanation: string; weight: number }[] }[] }>("/api/admin/antifraud")).data.queue[0];
    for (const s of qd?.signals ?? []) console.log(`      +${s.weight} ${s.explanation}`);
  }
  check(!created.data.deal.frozen, "перша невелика угода нових учасників не заморожена");
  const dealId = created.data.deal.id;

  check((await carol.api(`/api/deals/${dealId}`)).status === 404, "Керол не бачить чужу угоду (404)");
  check((await carol.api(`/api/deals/${dealId}/messages`, { body: "спам" })).status === 404, "Керол не може писати в чужий чат");
  check((await bob.api(`/api/deals/${dealId}/signature`)).status === 403, "покупець не отримує підпис депозиту");
  check((await mod.api(`/api/deals/${dealId}`)).status === 200, "модератор бачить угоду");

  await alice.api(`/api/deals/${dealId}/messages`, { body: "Привіт! Картка 5375 4141 0000 1234" });

  console.log("▶ Депозит в ескроу (справжні транзакції)");
  await alice.tx(USDT, mockUsdtAbi, "faucet", []);
  const sig = (await alice.api<{ chainDealId: Hex; buyer: Address; amount: string; reviewRequired: boolean; expiry: number; signature: Hex }>(`/api/deals/${dealId}/signature`)).data;
  check(sig.reviewRequired === true, "сервер підписав createDeal з reviewRequired = true");
  // Спроба обійти антифрод: підробити суму в підписаній угоді
  const tamper = await alice.tx(ESCROW, escrowAbi, "createDeal", [sig.chainDealId, sig.buyer, BigInt(sig.amount) * BigInt(2), sig.reviewRequired, BigInt(sig.expiry), sig.signature]).catch(() => "reverted");
  check(tamper === "reverted", "контракт відхилив createDeal зі зміненою сумою (InvalidSignature)");
  await alice.tx(ESCROW, escrowAbi, "createDeal", [sig.chainDealId, sig.buyer, BigInt(sig.amount), sig.reviewRequired, BigInt(sig.expiry), sig.signature]);
  await alice.tx(USDT, mockUsdtAbi, "approve", [ESCROW, BigInt(sig.amount)]);
  await alice.tx(ESCROW, escrowAbi, "deposit", [sig.chainDealId]);
  const s1 = await alice.api<{ deal: { status: string } }>(`/api/deals/${dealId}/sync`, {});
  check(s1.data.deal?.status === "funded", "після sync угода «Очікує оплату» (funded)");
  check((await pub.readContract({ address: USDT, abi: mockUsdtAbi, functionName: "balanceOf", args: [ESCROW] })) === parseUnits("50", 18), "50 mUSDT заблоковано в ескроу");

  console.log("▶ Оплата і відпуск коштів");
  const early = await alice.tx(ESCROW, escrowAbi, "confirmRelease", [sig.chainDealId]).catch(() => "reverted");
  check(early === "reverted", "продавець не може відпустити кошти в обхід сервера (ReviewPending)");
  const intent = await bob.api<{ mismatch: boolean }>(`/api/deals/${dealId}/paid-intent`, { senderName: "Бондар Богдан" });
  check(intent.data.mismatch === false, "ім'я відправника збігається з верифікованим");
  await wait(180);
  await bob.tx(ESCROW, escrowAbi, "markPaid", [sig.chainDealId]);
  check((await bob.api<{ deal: { status: string; frozen: boolean } }>(`/api/deals/${dealId}/sync`, {})).data.deal?.status === "paid", "«Я оплатив» → paid");

  check((await mod.api(`/api/deals/${dealId}/release`, { senderNameMatches: true, receivedInBank: true })).status === 403, "модератор не може відпустити кошти (403)");
  let rel = await alice.api<{ status: string; nonce?: string; message?: string }>(`/api/deals/${dealId}/release`, { senderNameMatches: true, receivedInBank: true });
  ok(`антифрод перед відпуском: ${rel.data.status}`);
  if (rel.data.status === "needs_signature") {
    const signature = await alice.account.signMessage({ message: rel.data.message! });
    rel = await alice.api(`/api/deals/${dealId}/release-signature`, { nonce: rel.data.nonce, signature });
    check(rel.data.status === "approved", "середній ризик: підтверджено підписом гаманця продавця");
  }
  check(rel.data.status === "approved", "сервер схвалив відпуск (approveRelease у контракті)");
  const buyerBefore = await pub.readContract({ address: USDT, abi: mockUsdtAbi, functionName: "balanceOf", args: [bob.account.address] });
  await alice.tx(ESCROW, escrowAbi, "confirmRelease", [sig.chainDealId]);
  const s3 = await alice.api<{ deal: { status: string } }>(`/api/deals/${dealId}/sync`, {});
  check(s3.data.deal?.status === "released", "угода завершена (released)");
  const buyerAfter = await pub.readContract({ address: USDT, abi: mockUsdtAbi, functionName: "balanceOf", args: [bob.account.address] });
  check(buyerAfter - buyerBefore === parseUnits("50", 18), "Боб отримав 50 mUSDT");
  const msgs = (await bob.api<{ messages: { body: string }[] }>(`/api/deals/${dealId}/messages`)).data.messages;
  check(msgs.some((m) => m.body.includes("**** **** **** 1234")) && !msgs.some((m) => m.body.includes("5375 4141")), "номер картки в чаті замасковано після закриття");
  const view = (await bob.api<{ events: { action: string; actor_wallet: string }[] }>(`/api/deals/${dealId}`)).data;
  check(view.events.length >= 8 && view.events.some((e) => e.actor_wallet === alice.address), `журнал угоди: ${view.events.length} подій з адресами гаманців`);

  console.log("▶ Спір і рішення адміна");
  const d2 = (await carol.api<{ deal: { id: string } }>("/api/deals", { offerId: offer.data.offer.id, amountUsdt: 20, paymentMethod: "Monobank" })).data.deal;
  const sig2 = (await alice.api<{ chainDealId: Hex; buyer: Address; amount: string; expiry: number; signature: Hex }>(`/api/deals/${d2.id}/signature`)).data;
  await alice.tx(ESCROW, escrowAbi, "createDeal", [sig2.chainDealId, sig2.buyer, BigInt(sig2.amount), true, BigInt(sig2.expiry), sig2.signature]);
  await alice.tx(USDT, mockUsdtAbi, "approve", [ESCROW, BigInt(sig2.amount)]);
  await alice.tx(ESCROW, escrowAbi, "deposit", [sig2.chainDealId]);
  await carol.api(`/api/deals/${d2.id}/sync`, {});
  await carol.api(`/api/deals/${d2.id}/paid-intent`, { senderName: "Кароліна Сич" });
  await wait(180);
  await carol.tx(ESCROW, escrowAbi, "markPaid", [sig2.chainDealId]);
  await carol.api(`/api/deals/${d2.id}/sync`, {});
  check((await carol.api(`/api/deals/${d2.id}/dispute`, { reason: "Оплатила, продавець мовчить" })).status === 200, "Керол відкрила спір");
  await carol.tx(ESCROW, escrowAbi, "openDispute", [sig2.chainDealId]);
  check((await carol.api<{ deal: { status: string } }>(`/api/deals/${d2.id}/sync`, {})).data.deal?.status === "disputed", "угода в стані спору");
  check((await mod.api(`/api/mod/deals/${d2.id}/recommend`, { recommendation: "Виписка підтверджує оплату", toBuyer: 20 })).status === 200, "модератор дав рекомендацію");
  check((await mod.api(`/api/admin/deals/${d2.id}/resolve`, { txHash: "0x" + "1".repeat(64), note: "x" })).status === 403, "модератор не може записати рішення (403)");
  const modTx = await mod.tx(ESCROW, escrowAbi, "resolveDispute", [sig2.chainDealId, parseUnits("20", 18)]).catch(() => "reverted");
  check(modTx === "reverted", "модератор не може викликати resolveDispute у контракті");
  const resolveHash = await admin.tx(ESCROW, escrowAbi, "resolveDispute", [sig2.chainDealId, parseUnits("20", 18)]);
  check((await admin.api(`/api/admin/deals/${d2.id}/resolve`, { txHash: resolveHash, note: "На користь покупця" })).status === 200, "адмін вирішив спір транзакцією з гаманця");
  check((await admin.api(`/api/admin/deals/${d2.id}/label`, { label: "honest" })).status === 200, "адмін позначив спір «чесна угода»");

  console.log("▶ Антифрод: ліміти, чорний список, налаштування");
  const bigOffer = await alice.api<{ offer: { id: string } }>("/api/offers", { side: "sell", price_uah: 41.6, min_usdt: 10, max_usdt: 1000, payment_methods: ["ПриватБанк"], terms: "" });
  const big = await bob.api<{ error: string }>("/api/deals", { offerId: bigOffer.data.offer.id, amountUsdt: 150, paymentMethod: "ПриватБанк" });
  check(big.status === 403 && /ліміт/.test(big.data.error), `разовий ліміт нового учасника: «${big.data.error}»`);
  {
    const input = { kind: "wallet", value: carol.address, reason: "e2e" };
    const signed = await admin.signed("blacklist.add", input);
    check((await admin.api("/api/admin/blacklist", { input, signed })).status === 200, "адмін додав гаманець у чорний список (з підписом)");
    const b = await carol.api<{ error: string }>("/api/deals", { offerId: offer.data.offer.id, amountUsdt: 10, paymentMethod: "Monobank" });
    check(b.status === 403, `угода з гаманця в чорному списку заблокована: «${b.data.error}»`);
  }
  const ov = (await admin.api<{ config: { thresholds: { medium: number; high: number } } & Record<string, unknown> }>("/api/admin/antifraud")).data;
  const cfg2 = { ...ov.config, thresholds: { medium: 25, high: 55 } };
  const signedCfg = await admin.signed("antifraud.config", cfg2);
  check((await admin.api("/api/admin/antifraud", { input: cfg2, signed: signedCfg }, "PUT")).status === 200, "ваги/пороги змінено в адмінці без зміни коду");
  check((await mod.api("/api/admin/antifraud", { input: cfg2 }, "PUT")).status === 403, "модератор не може змінювати налаштування антифроду");

  console.log("▶ Кіпер (автоскасування)");
  check((await fetch(`${BASE}/api/cron/keeper`)).status === 401, "кіпер без CRON_SECRET — 401");
  const k = await fetch(`${BASE}/api/cron/keeper`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check(k.ok, `кіпер відпрацював: ${JSON.stringify(await k.json())}`);

  const dash = await admin.api<{ stats: Record<string, string> }>("/api/admin/dashboard");
  check(Number(dash.data.stats?.deals_total) === 2, `дашборд: угод ${dash.data.stats?.deals_total}, обсяг ${dash.data.stats?.volume_usdt} USDT`);
  check((await mod.api("/api/admin/dashboard")).status === 403, "модератор не має доступу до дашборду адміна");

  fs.writeFileSync(path.join(ROOT, "e2e", "sessions.json"), JSON.stringify({ base: BASE, admin: admin.cookie, alice: alice.cookie, bob: bob.cookie, mod: mod.cookie, aliceKey: alice.key, bobKey: bob.key, escrow: ESCROW, usdt: USDT, offerId: offer.data.offer.id, dealId, disputeDealId: d2.id }, null, 2));
  if (process.env.E2E_KEEP_RUNNING) {
    console.log(`\nСервери працюють (${BASE}). Ctrl+C для зупинки.`);
    await new Promise(() => {});
  }
}

let stopStack: (() => Promise<void>) | null = null;

main()
  .catch((e) => {
    failures++;
    console.error("\n✗", e);
  })
  .finally(async () => {
    if (stopStack) await stopStack().catch(() => {});
    killAll();
    if (!process.env.E2E_KEEP_RUNNING) {
      console.log(failures ? `\n✗ Невдалих перевірок: ${failures}` : "\n✓ E2E: усе пройдено");
      process.exit(failures ? 1 : 0);
    }
  });
