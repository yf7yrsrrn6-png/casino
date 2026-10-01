import fs from "fs";
import path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";
import type { Db } from "@/server/db";
import type { EscrowGateway, OnchainDeal } from "@/server/chain";
import { toUnits } from "@/server/chain";
import type { Ctx } from "@/server/services/context";
import type { Actor, RequestMeta } from "@/server/auth";
import { loadActor } from "@/server/auth";
import { StubAmlProvider, HeuristicIpIntel } from "@/server/antifraud/providers";
import { createActionChallenge } from "@/server/services/identity";

type Q = PGlite | Transaction;

/** node-postgres сам перетворює JS-масиви на масиви Postgres; PGlite — ні. */
const pgArray = (a: unknown[]): string =>
  "{" + a.map((v) => (v === null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",") + "}";

class PGliteDb implements Db {
  constructor(private readonly pg: Q, private readonly nested = false) {}
  async query<T>(text: string, params?: unknown[]) {
    const ps = params?.map((p) => (Array.isArray(p) ? pgArray(p) : p));
    const r = await this.pg.query<T>(text, ps as unknown[]);
    return { rows: r.rows };
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (!this.nested && "transaction" in this.pg) {
      return (this.pg as PGlite).transaction((tx) => fn(new PGliteDb(tx, true)));
    }
    const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
    await this.pg.query(`savepoint ${sp}`);
    try {
      const r = await fn(this);
      await this.pg.query(`release savepoint ${sp}`);
      return r;
    } catch (e) {
      await this.pg.query(`rollback to savepoint ${sp}`);
      throw e;
    }
  }
}

export async function createTestDb(): Promise<{ pg: PGlite; db: Db }> {
  const pg = new PGlite();
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  return { pg, db: new PGliteDb(pg) };
}

/** Фейковий контракт із тими самими правилами, що й LoopsTrdEscrow (для інтеграційних тестів сервера). */
export class FakeEscrow implements EscrowGateway {
  readonly configured = true;
  readonly chainId = 97;
  readonly escrowAddress = "0x00000000000000000000000000000000000e5c20";
  readonly usdtAddress = "0x0000000000000000000000000000000000005d70";
  deals = new Map<string, OnchainDeal>();
  calls: string[] = [];
  now = Math.floor(Date.now() / 1000);
  window = 30 * 60;
  grace = 15 * 60;
  block = BigInt(100);
  /** Журнал «подій» для індексатора: [номер блоку, dealId]. */
  events: [bigint, string][] = [];
  gas = "1.0";
  private touch(id: string) {
    this.block += BigInt(1);
    this.events.push([this.block, id]);
  }

  async signCreateDeal(p: { chainDealId: Hex; reviewRequired: boolean }) {
    this.calls.push(`sign:${p.chainDealId}:${p.reviewRequired}`);
    return { signature: "0xsig" as Hex, expiry: this.now + 1200 };
  }
  private get(id: string) {
    const d = this.deals.get(id);
    if (!d) throw new Error("DealNotFound");
    return d;
  }
  async getDeal(id: Hex): Promise<OnchainDeal> {
    return (
      this.deals.get(id) ?? {
        seller: "0x0000000000000000000000000000000000000000",
        buyer: "0x0000000000000000000000000000000000000000",
        amount: BigInt(0),
        fundedAt: 0,
        paymentDeadline: 0,
        cancelAvailableAt: 0,
        paidAt: 0,
        status: "None",
        frozen: false,
        reviewRequired: false,
        reviewApproved: false,
      }
    );
  }
  async approveRelease(id: Hex) {
    const d = this.get(id);
    if (d.status !== "Funded" && d.status !== "Paid") throw new Error("InvalidStatus");
    d.reviewApproved = true;
    this.calls.push(`approve:${id}`);
    return "0xa1" as Hex;
  }
  async freezeDeal(id: Hex) {
    const d = this.get(id);
    if (d.frozen) throw new Error("DealIsFrozen");
    d.frozen = true;
    this.calls.push(`freeze:${id}`);
    return "0xf1" as Hex;
  }
  async cancel(id: Hex) {
    const d = this.get(id);
    if (d.frozen) throw new Error("DealIsFrozen");
    if (d.status !== "Funded" || this.now <= d.cancelAvailableAt) throw new Error("PaymentWindowActive");
    d.status = "Cancelled";
    this.calls.push(`cancel:${id}`);
    return "0xc1" as Hex;
  }
  async readResolution(_tx: Hex, id: Hex) {
    const d = this.deals.get(id);
    return d && d.status === "Resolved" ? (this.resolutions.get(id) ?? null) : null;
  }
  async blockTime() {
    return this.now;
  }
  async latestBlock() {
    return this.block;
  }
  async dealIdsInBlocks(from: bigint, to: bigint) {
    return [...new Set(this.events.filter(([b]) => b >= from && b <= to).map(([, id]) => id as Hex))];
  }
  async signerBalance() {
    return { address: "0x00000000000000000000000000000000000b4c4e", balance: this.gas };
  }
  resolutions = new Map<string, { toBuyer: bigint; toSeller: bigint }>();

  // ── дії «користувачів» у контракті ──
  userCreateAndDeposit(id: Hex, seller: string, buyer: string, amountUsdt: string | number) {
    this.deals.set(id, {
      seller,
      buyer,
      amount: toUnits(String(amountUsdt)),
      fundedAt: this.now,
      paymentDeadline: this.now + this.window,
      cancelAvailableAt: this.now + this.window + this.grace,
      paidAt: 0,
      status: "Funded",
      frozen: false,
      reviewRequired: true,
      reviewApproved: false,
    });
    this.touch(id);
  }
  userMarkPaid(id: Hex) {
    const d = this.get(id);
    if (d.frozen) throw new Error("DealIsFrozen");
    if (d.status !== "Funded") throw new Error("InvalidStatus");
    d.status = "Paid";
    d.paidAt = this.now;
    this.touch(id);
  }
  userConfirmRelease(id: Hex) {
    const d = this.get(id);
    if (d.status !== "Funded" && d.status !== "Paid") throw new Error("InvalidStatus");
    if (d.frozen) throw new Error("DealIsFrozen");
    if (d.reviewRequired && !d.reviewApproved) throw new Error("ReviewPending");
    d.status = "Released";
    this.touch(id);
  }
  userOpenDispute(id: Hex) {
    const d = this.get(id);
    if (d.status !== "Funded" && d.status !== "Paid") throw new Error("InvalidStatus");
    d.status = "Disputed";
    this.touch(id);
  }
  adminResolve(id: Hex, toBuyer: bigint) {
    const d = this.get(id);
    if (!(d.status === "Disputed" || (d.frozen && (d.status === "Funded" || d.status === "Paid")))) throw new Error("InvalidStatus");
    d.status = "Resolved";
    d.frozen = false;
    this.resolutions.set(id, { toBuyer, toSeller: d.amount - toBuyer });
    this.touch(id);
  }
}

export function makeCtx(db: Db, chain = new FakeEscrow(), opts: { now?: () => Date; amlHigh?: string[]; amlMedium?: string[] } = {}): Ctx & { chain: FakeEscrow } {
  return {
    db,
    chain,
    aml: new StubAmlProvider(opts.amlHigh ?? [], opts.amlMedium ?? []),
    ipIntel: new HeuristicIpIntel(),
    now: opts.now ?? (() => new Date()),
    domain: "loops.test",
    chainId: 97,
    bootstrapAdminWallet: null,
  };
}

export interface TestUser {
  actor: Actor;
  key: Hex;
  wallet: string;
  sign: (message: string) => Promise<Hex>;
}

let counter = 0;

/** Створює учасника напряму в БД (минаючи інвайт) з потрібною роллю/статусом. */
export async function createUser(
  db: Db,
  o: { role?: "member" | "moderator" | "admin"; status?: string; name?: string; card?: string; holder?: string; ageDays?: number; deals?: number } = {},
): Promise<TestUser> {
  const key = generatePrivateKey();
  const acc = privateKeyToAccount(key);
  const wallet = acc.address.toLowerCase();
  counter++;
  const holder = o.holder ?? `Тест Користувач${String.fromCharCode(1040 + (counter % 30))}`;
  const card = o.card ?? String(1000 + counter).slice(-4);
  const { rows } = await db.query<{ id: string }>(
    `insert into profiles (wallet_address, role, status, display_name, telegram, card_holder_name, card_last4, profile_completed,
        successful_deals, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, true, $8, now() - make_interval(days => $9)) returning id`,
    [wallet, o.role ?? "member", o.status ?? "approved", o.name ?? `user${counter}`, `@user_${counter}x`, holder, card, o.deals ?? 0, o.ageDays ?? 60],
  );
  await db.query(`insert into card_history (user_id, card_last4, card_holder_name) values ($1, $2, $3)`, [rows[0].id, card, holder]);
  await db.query(`insert into wallet_history (user_id, wallet_address) values ($1, $2)`, [rows[0].id, wallet]);
  const actor = (await loadActor(db, rows[0].id))!;
  return { actor, key, wallet, sign: (message) => acc.signMessage({ message }) };
}

export function meta(o: Partial<RequestMeta> = {}): RequestMeta {
  return {
    ip: o.ip ?? `10.0.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    deviceHash: o.deviceHash === undefined ? `dev_${Math.random().toString(36).slice(2, 12)}` : o.deviceHash,
    userAgent: "vitest",
    timezone: o.timezone ?? "Europe/Kyiv",
    proxyHints: o.proxyHints ?? [],
  };
}

/** Позначає пристрій як «давно відомий», щоб не спрацьовував сигнал нового пристрою. */
export async function ageDevices(db: Db, userId: string, days = 30) {
  await db.query(`update user_devices set first_seen = now() - make_interval(days => $2) where user_id = $1`, [userId, days]);
}

export async function signAction(ctx: Ctx, u: TestUser, action: string, payload: unknown) {
  const ch = await createActionChallenge(ctx, u.actor, action, payload);
  return { nonce: ch.nonce, signature: await u.sign(ch.message) };
}

export async function siwe(u: { wallet: string }, nonce: string, domain = "loops.test", chainId = 97) {
  return createSiweMessage({
    address: privateKeyToAccount((u as TestUser).key).address,
    chainId,
    domain,
    nonce,
    uri: `https://${domain}`,
    version: "1",
    statement: "Вхід до Loops Trd",
    issuedAt: new Date(),
  });
}

export async function newOffer(db: Db, userId: string, o: Partial<{ side: "buy" | "sell"; price: number; min: number; max: number }> = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into offers (user_id, side, price_uah, min_usdt, max_usdt, payment_methods) values ($1, $2, $3, $4, $5, $6) returning id`,
    [userId, o.side ?? "sell", o.price ?? 41.5, o.min ?? 10, o.max ?? 1000, ["Monobank", "ПриватБанк"]],
  );
  return rows[0].id;
}
