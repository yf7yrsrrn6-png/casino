import { describe, expect, it, beforeAll } from "vitest";
import {
  evaluate,
  collectSignals,
  hardRules,
  namesMatch,
  computeLimits,
  mergeConfig,
  antifraudConfigSchema,
  DEFAULT_CONFIG,
  explain,
  type PartyFacts,
  type RiskInput,
  type AntifraudConfig,
} from "@/server/antifraud";
import { signalStats, saveConfig, loadConfig, userGraph } from "@/server/antifraud/repository";
import { createTestDb, createUser } from "./harness";
import type { Db } from "@/server/db";

const cfg = DEFAULT_CONFIG;

function party(o: Partial<PartyFacts> = {}): PartyFacts {
  return {
    role: "buyer",
    userId: "u",
    wallet: "0x1",
    cardLast4: "1234",
    cardHolderName: "Іван Петренко",
    accountAgeDays: 120,
    successfulDeals: 20,
    disputesCount: 0,
    disputesLost: 0,
    blacklistHits: [],
    singleLimit: 1000,
    dailyLimit: 3000,
    volume24h: 0,
    deals1h: 0,
    avgDailyVolume30d: 200,
    medianAmount: 100,
    usualHours: [],
    device: { hash: "d1", firstSeenHoursAgo: 500, sharedWithUsers: 0 },
    ipSharedWithUsers: 0,
    proxySuspected: false,
    proxyReasons: [],
    timezone: "Europe/Kyiv",
    cardSharedWithUsers: 0,
    walletSharedWithUsers: 0,
    aml: { level: "low", source: "stub" },
    ...o,
  };
}

function input(o: Partial<RiskInput> = {}, buyer: Partial<PartyFacts> = {}, seller: Partial<PartyFacts> = {}): RiskInput {
  return {
    stage: "create",
    amountUsdt: 100,
    hourKyiv: 14,
    parties: [party({ role: "buyer", ...buyer }), party({ role: "seller", userId: "s", wallet: "0x2", ...seller })],
    partiesLinkedBy: [],
    ...o,
  };
}

describe("Антифрод — шар 1 (жорсткі правила)", () => {
  it("чиста угода досвідчених учасників — низький ризик, автоматично", () => {
    const r = evaluate(input(), cfg);
    expect(r).toMatchObject({ level: "low", decision: "allow", score: 0, hardRule: null });
  });

  it("чорний список гаманця/картки/пристрою/IP → миттєве блокування", () => {
    for (const kind of ["wallet", "card", "device", "ip"]) {
      const r = evaluate(input({}, { blacklistHits: [{ kind, value: "x", reason: "шахрайство" }] }), cfg);
      expect(r.decision).toBe("block");
      expect(r.hardRule).toBe("blacklist");
      expect(r.hardReasons[0]).toMatch(/чорному списку/);
    }
  });

  it("разовий ліміт", () => {
    const r = evaluate(input({ amountUsdt: 1500 }), cfg);
    expect(r.decision).toBe("block");
    expect(r.hardReasons.join()).toMatch(/разовий ліміт 1[\s ]?000/);
  });

  it("денний ліміт враховує вже проведені угоди", () => {
    const r = evaluate(input({ amountUsdt: 500 }, {}, { volume24h: 2800 }), cfg);
    expect(r.hardRule).toBe("daily_limit");
    expect(r.hardReasons[0]).toMatch(/^Продавець: денний обсяг/);
  });

  it("ризиковий гаманець за AML (high) блокує; medium — лише сигнал", () => {
    expect(evaluate(input({}, { aml: { level: "high", source: "amlbot" } }), cfg).hardRule).toBe("aml");
    const med = evaluate(input({}, { aml: { level: "medium", source: "amlbot" } }), cfg);
    expect(med.hardRule).toBeNull();
    expect(med.signals.map((s) => s.code)).toContain("aml_medium");
    const strict: AntifraudConfig = { ...cfg, amlBlockLevel: "medium" };
    expect(evaluate(input({}, { aml: { level: "medium", source: "amlbot" } }), strict).hardRule).toBe("aml");
  });

  it("після внесення коштів жорстке правило заморожує, а не блокує; ліміти вже не перевіряються", () => {
    const r = evaluate(input({ stage: "paid" }, { blacklistHits: [{ kind: "ip", value: "1.1.1.1", reason: "x" }] }), cfg);
    expect(r.decision).toBe("freeze");
    expect(hardRules(input({ stage: "paid", amountUsdt: 99999 }), cfg)).toHaveLength(0);
  });
});

describe("Антифрод — шар 2 (сигнали з вагою і поясненням)", () => {
  const codes = (i: RiskInput) => collectSignals(i, cfg).map((s) => s.code);

  it("пристрій: новий, невідомий, спільний; IP; VPN; часовий пояс", () => {
    expect(codes(input({}, { device: { hash: "d", firstSeenHoursAgo: 2, sharedWithUsers: 0 } }))).toContain("device_new");
    expect(codes(input({}, { device: null }))).toContain("device_unknown");
    expect(codes(input({}, { device: { hash: "d", firstSeenHoursAgo: 900, sharedWithUsers: 2 } }))).toContain("device_shared");
    expect(codes(input({}, { ipSharedWithUsers: 1 }))).toContain("ip_shared");
    expect(codes(input({}, { proxySuspected: true, proxyReasons: ["заголовок Via"] }))).toContain("proxy_suspected");
    expect(codes(input({}, { timezone: "Asia/Bangkok" }))).toContain("timezone_unusual");
  });

  it("граф зв'язків: картка, гаманець, пов'язані сторони", () => {
    expect(codes(input({}, { cardSharedWithUsers: 1 }))).toContain("card_shared");
    expect(codes(input({}, { walletSharedWithUsers: 1 }))).toContain("wallet_shared");
    expect(codes(input({ partiesLinkedBy: ["спільний пристрій"] }))).toContain("counterparty_linked");
  });

  it("швидкість: кількість за 1 год та обсяг за 24 год проти історії", () => {
    expect(codes(input({}, { deals1h: 3 }))).toContain("velocity_1h");
    expect(codes(input({ amountUsdt: 300 }, { volume24h: 400, avgDailyVolume30d: 100 }))).toContain("velocity_24h");
    expect(codes(input({ amountUsdt: 100 }, { volume24h: 100, avgDailyVolume30d: 100 }))).not.toContain("velocity_24h");
    // без історії за 30 днів сигнал не спрацьовує
    expect(codes(input({ amountUsdt: 300 }, { volume24h: 400, avgDailyVolume30d: 0 }))).not.toContain("velocity_24h");
  });

  it("поведінка: різкий ріст суми, нетиповий час, надто швидко", () => {
    expect(codes(input({ amountUsdt: 400 }, { medianAmount: 100 }))).toContain("amount_spike");
    expect(codes(input({ hourKyiv: 3 }))).toContain("unusual_hour");
    expect(codes(input({ hourKyiv: 20 }, { usualHours: [10, 11, 12, 13, 14, 10] }))).toContain("unusual_hour");
    expect(codes(input({ stage: "paid", timing: { secondsFundedToPaid: 10 } }))).toContain("too_fast");
    expect(codes(input({ stage: "release", timing: { secondsPaidToRelease: 5 } }))).toContain("too_fast");
    expect(codes(input({ stage: "release", timing: { secondsPaidToRelease: 600 } }))).not.toContain("too_fast");
  });

  it("репутація: новий акаунт, без історії, програні спори", () => {
    const c = codes(input({}, { accountAgeDays: 1, successfulDeals: 0, disputesLost: 2, disputesCount: 3 }));
    expect(c).toEqual(expect.arrayContaining(["account_new", "no_history", "dispute_history"]));
  });

  it("невідповідність імені відправника", () => {
    const r = collectSignals(input({ senderNameMismatch: { expected: "Іван Петренко", actual: "Олег Сидоренко" } }), cfg);
    const s = r.find((x) => x.code === "sender_name_mismatch")!;
    expect(s.weight).toBe(40);
    expect(s.explanation).toContain("Олег Сидоренко");
  });

  it("кожен сигнал має вагу, мітку і пояснення людською мовою", () => {
    const r = collectSignals(
      input({ hourKyiv: 3, amountUsdt: 600, partiesLinkedBy: ["спільна IP-адреса"] }, { accountAgeDays: 1, successfulDeals: 0, proxySuspected: true, singleLimit: 9999, dailyLimit: 9999 }),
      cfg,
    );
    expect(r.length).toBeGreaterThan(4);
    for (const s of r) {
      expect(s.weight).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.explanation).toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
    }
  });

  it("вимкнений сигнал не спрацьовує; вага береться з налаштувань", () => {
    const c2: AntifraudConfig = { ...cfg, signals: { ...cfg.signals, ip_shared: { ...cfg.signals.ip_shared, enabled: false }, account_new: { ...cfg.signals.account_new, weight: 77 } } };
    const r = collectSignals(input({}, { ipSharedWithUsers: 3, accountAgeDays: 1 }), c2);
    expect(r.map((s) => s.code)).not.toContain("ip_shared");
    expect(r.find((s) => s.code === "account_new")!.weight).toBe(77);
  });
});

describe("Антифрод — шар 3 (комбінації) і рішення", () => {
  it("новий акаунт + новий пристрій + велика сума = високий ризик → заморозка", () => {
    const r = evaluate(
      input({ amountUsdt: 600 }, { accountAgeDays: 1, device: { hash: "d", firstSeenHoursAgo: 1, sharedWithUsers: 0 }, singleLimit: 5000, dailyLimit: 5000 }, { singleLimit: 5000, dailyLimit: 5000 }),
      cfg,
    );
    expect(r.combos.map((c) => c.id)).toContain("new_account_device_big_amount");
    expect(r.level).toBe("high");
    expect(r.decision).toBe("freeze");
    expect(explain(r).some((l) => l.includes("Комбінація"))).toBe(true);
  });

  it("ті самі сигнали в різних сторін не утворюють комбінацію", () => {
    const r = evaluate(
      input({ amountUsdt: 600 }, { accountAgeDays: 1, singleLimit: 5000, dailyLimit: 5000 }, { device: { hash: "d", firstSeenHoursAgo: 1, sharedWithUsers: 0 }, singleLimit: 5000, dailyLimit: 5000 }),
      cfg,
    );
    expect(r.combos.map((c) => c.id)).not.toContain("new_account_device_big_amount");
  });

  it("перша невелика угода двох нових учасників на нових пристроях — середній ризик, не заморозка", () => {
    const fresh = { accountAgeDays: 0, successfulDeals: 0, device: { hash: "d", firstSeenHoursAgo: 0.1, sharedWithUsers: 0 }, medianAmount: null };
    const r = evaluate(input({ amountUsdt: 50 }, fresh, fresh), cfg);
    expect(r.level).toBe("medium");
    expect(r.decision).toBe("confirm");
  });

  it("середній ризик → додаткове підтвердження", () => {
    const r = evaluate(input({}, { accountAgeDays: 1, successfulDeals: 0, ipSharedWithUsers: 1, proxySuspected: true }), cfg); // 10 + 5 + 10 + 15 = 40
    expect(r.score).toBe(40);
    expect(r.level).toBe("medium");
    expect(r.decision).toBe("confirm");
  });

  it("пороги редагуються", () => {
    const r = evaluate(input({}, { accountAgeDays: 1, successfulDeals: 0, ipSharedWithUsers: 1, proxySuspected: true }), { ...cfg, thresholds: { medium: 50, high: 80 } });
    expect(r.level).toBe("low");
  });

  it("комбінація з додаванням балів", () => {
    const r = evaluate(input({ amountUsdt: 400 }, { deals1h: 5, medianAmount: 100 }, { medianAmount: null }), cfg);
    expect(r.combos.find((c) => c.id === "velocity_spike")?.addScore).toBe(20);
    expect(r.score).toBe(15 + 20 + 20);
  });
});

describe("Ліміти", () => {
  it("зростають з кількістю успішних угод", () => {
    const t = DEFAULT_CONFIG.limits.tiers;
    expect(computeLimits(t, 0)).toMatchObject({ single: 100, daily: 300 });
    expect(computeLimits(t, 3)).toMatchObject({ single: 300, daily: 1000 });
    expect(computeLimits(t, 12)).toMatchObject({ single: 1000, daily: 3000, nextTier: { minDeals: 30 } });
    expect(computeLimits(t, 100).nextTier).toBeNull();
  });
  it("персональні ліміти адміна мають пріоритет", () => {
    expect(computeLimits(DEFAULT_CONFIG.limits.tiers, 0, { single: 50, daily: null })).toMatchObject({ single: 50, daily: 300 });
  });
});

describe("Порівняння імен", () => {
  it.each([
    ["Іван Петренко", "Петренко Іван", true],
    ["Іван Петренко", "ПЕТРЕНКО І.", true],
    ["Іван Петренко", "іван  петренко", true],
    ["Ольга Коваль-Шевчук", "Ольга Ковальшевчук", true],
    ["Іван Петренко", "Петро Іваненко", false],
    ["Іван Петренко", "Олег Петренко", false],
  ])("%s ~ %s → %s", (a, b, ok) => expect(namesMatch(a, b)).toBe(ok));
});

describe("Налаштування", () => {
  it("валідація: high > medium, ваги 0–100", () => {
    expect(antifraudConfigSchema.safeParse({ ...cfg, thresholds: { medium: 50, high: 40 } }).success).toBe(false);
    expect(antifraudConfigSchema.safeParse({ ...cfg, signals: { ...cfg.signals, ip_shared: { enabled: true, weight: 500, params: {} } } }).success).toBe(false);
    expect(antifraudConfigSchema.safeParse(cfg).success).toBe(true);
  });
  it("злиття з дефолтами (нові сигнали підхоплюються автоматично)", () => {
    const m = mergeConfig({ thresholds: { medium: 20 }, signals: { ip_shared: { weight: 3 } } });
    expect(m.thresholds).toEqual({ medium: 20, high: 60 });
    expect(m.signals.ip_shared.weight).toBe(3);
    expect(m.signals.device_new.weight).toBe(DEFAULT_CONFIG.signals.device_new.weight);
  });

  let db: Db;
  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  it("зберігаються в БД і редагуються без зміни коду", async () => {
    const u = await createUser(db, { role: "admin" });
    expect((await loadConfig(db)).thresholds.medium).toBe(30);
    await saveConfig(db, { ...cfg, thresholds: { medium: 25, high: 70 } }, u.actor.id);
    expect((await loadConfig(db)).thresholds).toEqual({ medium: 25, high: 70 });
  });

  it("статистика точності сигналів за розміченими спорами", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const mk = async (label: "fraud" | "honest", codes: string[]) => {
      const id = crypto.randomUUID();
      await db.query(
        `insert into deals (id, chain_deal_id, seller_id, buyer_id, seller_wallet, buyer_wallet, amount_usdt, price_uah, total_uah, payment_method, status)
         values ($1, $2, $3, $4, 'x', 'y', 10, 40, 400, 'Monobank', 'resolved')`,
        [id, "0x" + id.replace(/-/g, "").padEnd(64, "0"), a.actor.id, b.actor.id],
      );
      await db.query(`insert into risk_assessments (user_id, deal_id, stage, score, level, decision, signals) values ($1, $2, 'create', 1, 'low', 'allow', $3)`, [
        a.actor.id,
        id,
        JSON.stringify(codes.map((code) => ({ code }))),
      ]);
      await db.query(`insert into disputes (deal_id, opened_by, reason, status, fraud_label) values ($1, $2, 'причина', 'resolved', $3)`, [id, a.actor.id, label]);
    };
    await mk("fraud", ["sender_name_mismatch", "account_new"]);
    await mk("fraud", ["sender_name_mismatch"]);
    await mk("honest", ["account_new"]);
    const s = await signalStats(db);
    expect(s.totals).toEqual({ fraud: 2, honest: 1 });
    const name = s.signals.find((x) => x.code === "sender_name_mismatch")!;
    expect(name).toMatchObject({ firedOnFraud: 2, firedOnHonest: 0, precision: 1, recall: 1 });
    const age = s.signals.find((x) => x.code === "account_new")!;
    expect(age).toMatchObject({ firedOnFraud: 1, firedOnHonest: 1, precision: 0.5, recall: 0.5 });
  });

  it("граф зв'язків: спільний пристрій і картка", async () => {
    const a = await createUser(db, { card: "7777", holder: "Спільний Власник" });
    const b = await createUser(db, { card: "7777", holder: "Спільний Власник" });
    await db.query(`insert into user_devices (user_id, device_hash) values ($1, 'same-dev'), ($2, 'same-dev')`, [a.actor.id, b.actor.id]);
    const g = await userGraph(db, a.actor.id);
    expect(g.find((l) => l.kind === "device")?.users[0].id).toBe(b.actor.id);
    expect(g.find((l) => l.kind === "card")?.value).toContain("7777");
  });
});
