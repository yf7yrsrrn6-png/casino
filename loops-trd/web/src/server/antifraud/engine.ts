import type { AntifraudConfig, SignalCode } from "./config";
import { SIGNAL_LABELS } from "./config";
import type { AmlResult } from "./providers";

export type RiskLevel = "low" | "medium" | "high";
export type Decision = "allow" | "confirm" | "freeze" | "block";
export type Stage = "create" | "paid" | "release";
export type PartyRole = "buyer" | "seller";

/** Факти про одну сторону угоди, зібрані з БД заздалегідь (engine — чиста функція). */
export interface PartyFacts {
  role: PartyRole;
  userId: string;
  wallet: string;
  cardLast4: string | null;
  cardHolderName: string | null;
  accountAgeDays: number;
  successfulDeals: number;
  disputesCount: number;
  disputesLost: number;
  blacklistHits: { kind: string; value: string; reason: string }[];
  singleLimit: number;
  dailyLimit: number;
  /** Обсяг угод учасника за останні 24 год без поточної угоди. */
  volume24h: number;
  /** Кількість угод учасника за останню годину без поточної. */
  deals1h: number;
  /** Середньодобовий обсяг за попередні 30 днів (без останніх 24 год). */
  avgDailyVolume30d: number;
  /** Медіана сум попередніх успішних угод або null, якщо історії немає. */
  medianAmount: number | null;
  /** Години (0–23, Київ), у які учасник зазвичай проводить угоди. */
  usualHours: number[];
  device: { hash: string | null; firstSeenHoursAgo: number | null; sharedWithUsers: number } | null;
  ipSharedWithUsers: number;
  proxySuspected: boolean;
  proxyReasons: string[];
  timezone: string | null;
  cardSharedWithUsers: number;
  walletSharedWithUsers: number;
  aml: AmlResult;
}

export interface RiskInput {
  stage: Stage;
  amountUsdt: number;
  /** Година за Києвом (0–23). */
  hourKyiv: number;
  parties: PartyFacts[];
  /** Покупець і продавець мають спільні пристрої/IP/картки (самоторгівля, мульти-акаунти). */
  partiesLinkedBy: string[];
  timing?: { secondsFundedToPaid?: number | null; secondsPaidToRelease?: number | null };
  senderNameMismatch?: { expected: string; actual: string } | null;
}

export interface FiredSignal {
  code: SignalCode;
  party: PartyRole | "deal";
  layer: 2 | 3;
  weight: number;
  label: string;
  explanation: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  decision: Decision;
  hardRule: string | null;
  hardReasons: string[];
  signals: FiredSignal[];
  combos: { id: string; label: string; addScore: number; forceLevel: string | null; party: PartyRole | "deal" }[];
}

const partyName = (r: PartyRole | "deal") => (r === "buyer" ? "Покупець" : r === "seller" ? "Продавець" : "Угода");
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("uk-UA");

/** Шар 1: жорсткі правила. Повертає причини миттєвого блокування. */
export function hardRules(input: RiskInput, cfg: AntifraudConfig): { rule: string; reason: string }[] {
  const out: { rule: string; reason: string }[] = [];
  for (const p of input.parties) {
    const who = partyName(p.role);
    for (const b of p.blacklistHits) {
      const kind = { wallet: "гаманець", card: "картка", device: "пристрій", ip: "IP" }[b.kind] ?? b.kind;
      out.push({ rule: "blacklist", reason: `${who}: ${kind} у чорному списку (${b.reason})` });
    }
    // Ліміти перевіряються лише при створенні угоди — далі сума вже зафіксована.
    if (input.stage === "create") {
      if (input.amountUsdt > p.singleLimit) {
        out.push({
          rule: "single_limit",
          reason: `${who}: сума ${fmt(input.amountUsdt)} USDT перевищує разовий ліміт ${fmt(p.singleLimit)} USDT`,
        });
      }
      if (p.volume24h + input.amountUsdt > p.dailyLimit) {
        out.push({
          rule: "daily_limit",
          reason: `${who}: денний обсяг ${fmt(p.volume24h + input.amountUsdt)} USDT перевищить денний ліміт ${fmt(p.dailyLimit)} USDT`,
        });
      }
    }
    const amlBlocks = p.aml.level === "high" || (cfg.amlBlockLevel === "medium" && p.aml.level === "medium");
    if (amlBlocks) {
      out.push({
        rule: "aml",
        reason: `${who}: гаманець має ризик «${p.aml.level}» за перевіркою ${p.aml.source}${p.aml.details ? ` (${p.aml.details})` : ""}`,
      });
    }
  }
  return out;
}

/** Шар 2: сигнали ризику з вагами й поясненнями. */
export function collectSignals(input: RiskInput, cfg: AntifraudConfig): FiredSignal[] {
  const fired: FiredSignal[] = [];
  const add = (code: SignalCode, party: PartyRole | "deal", explanation: string) => {
    const sc = cfg.signals[code];
    if (!sc?.enabled) return;
    fired.push({ code, party, layer: 2, weight: sc.weight, label: SIGNAL_LABELS[code], explanation });
  };
  const P = (code: SignalCode) => cfg.signals[code].params;

  for (const p of input.parties) {
    const who = partyName(p.role);

    // Пристрій
    if (!p.device || !p.device.hash) {
      add("device_unknown", p.role, `${who}: не вдалося отримати відбиток браузера`);
    } else {
      if (p.device.firstSeenHoursAgo !== null && p.device.firstSeenHoursAgo < (P("device_new").hours ?? 24)) {
        add("device_new", p.role, `${who}: пристрій вперше з'явився ${fmt(p.device.firstSeenHoursAgo)} год тому`);
      }
      if (p.device.sharedWithUsers > 0) {
        add("device_shared", p.role, `${who}: цей пристрій використовують ще ${p.device.sharedWithUsers} акаунт(и)`);
      }
    }
    if (p.ipSharedWithUsers > 0) add("ip_shared", p.role, `${who}: IP-адреса збігається з ${p.ipSharedWithUsers} іншим(и) акаунтом(ами)`);
    if (p.proxySuspected) add("proxy_suspected", p.role, `${who}: ознаки VPN/проксі — ${p.proxyReasons.join(", ") || "за даними IP-перевірки"}`);
    if (p.timezone && !cfg.expectedTimezones.includes(p.timezone)) {
      add("timezone_unusual", p.role, `${who}: часовий пояс браузера ${p.timezone}`);
    }

    // Граф зв'язків
    if (p.cardSharedWithUsers > 0) add("card_shared", p.role, `${who}: картка *${p.cardLast4} з тим самим власником є ще в ${p.cardSharedWithUsers} акаунт(і/ах)`);
    if (p.walletSharedWithUsers > 0) add("wallet_shared", p.role, `${who}: гаманець раніше був прив'язаний до ${p.walletSharedWithUsers} іншого(их) акаунта(ів)`);

    // Швидкість
    const maxCount = P("velocity_1h").maxCount ?? 3;
    if (input.stage === "create" && p.deals1h >= maxCount) {
      add("velocity_1h", p.role, `${who}: ${p.deals1h} угод за останню годину (поріг ${maxCount})`);
    }
    const mult24 = P("velocity_24h").multiplier ?? 3;
    const minVol = P("velocity_24h").minVolume ?? 100;
    const vol24 = p.volume24h + input.amountUsdt;
    // Без історії за 30 днів порівнювати нема з чим — новизну покривають no_history/account_new.
    if (input.stage === "create" && p.avgDailyVolume30d > 0 && vol24 >= minVol && vol24 > p.avgDailyVolume30d * mult24) {
      add(
        "velocity_24h",
        p.role,
        `${who}: обсяг за 24 год ${fmt(vol24)} USDT — у ${fmt(vol24 / p.avgDailyVolume30d)} раз(и) більше за звичний (${fmt(p.avgDailyVolume30d)} USDT/добу)`,
      );
    }

    // Поведінка
    const multSpike = P("amount_spike").multiplier ?? 3;
    if (p.medianAmount !== null && input.amountUsdt > p.medianAmount * multSpike) {
      add("amount_spike", p.role, `${who}: сума ${fmt(input.amountUsdt)} USDT у ${fmt(input.amountUsdt / p.medianAmount)} раз(и) більша за звичну (${fmt(p.medianAmount)} USDT)`);
    }
    if (p.usualHours.length >= 5 && !p.usualHours.includes(input.hourKyiv)) {
      add("unusual_hour", p.role, `${who}: зазвичай не проводить угоди о ${input.hourKyiv}:00`);
    }

    // Репутація
    const days = P("account_new").days ?? 7;
    if (p.accountAgeDays < days) add("account_new", p.role, `${who}: акаунту ${fmt(p.accountAgeDays)} дн. (менше ${days})`);
    if (p.successfulDeals === 0) add("no_history", p.role, `${who}: ще немає жодної успішної угоди`);
    const maxLost = P("dispute_history").maxLost ?? 0;
    if (p.disputesLost > maxLost) add("dispute_history", p.role, `${who}: програв(ла) ${p.disputesLost} спір(ів) із ${p.disputesCount}`);

    if (p.aml.level === "medium") add("aml_medium", p.role, `${who}: AML-перевірка (${p.aml.source}) — середній ризик`);
  }

  // Рівень угоди
  const bigAmount = cfg.signals.amount_large.params.amount ?? 500;
  if (input.amountUsdt >= bigAmount) add("amount_large", "deal", `Сума ${fmt(input.amountUsdt)} USDT ≥ ${fmt(bigAmount)} USDT`);

  const startH = cfg.signals.unusual_hour.params.startHour ?? 1;
  const endH = cfg.signals.unusual_hour.params.endHour ?? 6;
  if (input.hourKyiv >= startH && input.hourKyiv < endH && !fired.some((f) => f.code === "unusual_hour")) {
    add("unusual_hour", "deal", `Угода в нічний час (${input.hourKyiv}:00 за Києвом)`);
  }

  if (input.partiesLinkedBy.length > 0) {
    add("counterparty_linked", "deal", `Покупець і продавець пов'язані: ${input.partiesLinkedBy.join(", ")}`);
  }

  const minPaid = cfg.signals.too_fast.params.minPaidSeconds ?? 60;
  const minRel = cfg.signals.too_fast.params.minReleaseSeconds ?? 60;
  const t = input.timing;
  if (t?.secondsFundedToPaid != null && t.secondsFundedToPaid < minPaid) {
    add("too_fast", "deal", `«Я оплатив» натиснуто через ${Math.round(t.secondsFundedToPaid)} с після внесення ескроу (менше ${minPaid} с)`);
  } else if (t?.secondsPaidToRelease != null && t.secondsPaidToRelease < minRel) {
    add("too_fast", "deal", `Підтвердження через ${Math.round(t.secondsPaidToRelease)} с після оплати (менше ${minRel} с)`);
  }

  if (input.senderNameMismatch) {
    add(
      "sender_name_mismatch",
      "deal",
      `Ім'я відправника «${input.senderNameMismatch.actual}» не збігається з верифікованим «${input.senderNameMismatch.expected}»`,
    );
  }

  return fired;
}

export function levelFor(score: number, cfg: AntifraudConfig): RiskLevel {
  if (score >= cfg.thresholds.high) return "high";
  if (score >= cfg.thresholds.medium) return "medium";
  return "low";
}

const rank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** Повна оцінка: шар 1 → шар 2 → шар 3 → рішення. */
export function evaluate(input: RiskInput, cfg: AntifraudConfig): RiskResult {
  const hard = hardRules(input, cfg);
  const signals = collectSignals(input, cfg);

  // Шар 3: комбінації оцінюються окремо для кожної сторони (сигнали угоди діють для обох).
  const combos: RiskResult["combos"] = [];
  let forced: RiskLevel | null = null;
  for (const rule of cfg.combos) {
    if (!rule.enabled) continue;
    for (const party of ["buyer", "seller"] as const) {
      const codes = new Set(signals.filter((s) => s.party === party || s.party === "deal").map((s) => s.code));
      if (rule.all.every((c) => codes.has(c))) {
        combos.push({ id: rule.id, label: rule.label, addScore: rule.addScore, forceLevel: rule.forceLevel, party });
        if (rule.forceLevel && (!forced || rank[rule.forceLevel] > rank[forced])) forced = rule.forceLevel;
        break; // одна комбінація зараховується один раз на угоду
      }
    }
  }

  const score = signals.reduce((a, s) => a + s.weight, 0) + combos.reduce((a, c) => a + c.addScore, 0);
  let level = levelFor(score, cfg);
  if (forced && rank[forced] > rank[level]) level = forced;

  let decision: Decision;
  if (hard.length > 0) {
    // До внесення коштів — блокуємо угоду; якщо кошти вже в ескроу — заморожуємо.
    decision = input.stage === "create" ? "block" : "freeze";
    level = "high";
  } else if (level === "high") decision = "freeze";
  else if (level === "medium") decision = "confirm";
  else decision = "allow";

  return {
    score,
    level,
    decision,
    hardRule: hard[0]?.rule ?? null,
    hardReasons: hard.map((h) => h.reason),
    signals,
    combos,
  };
}

/** Людське пояснення рішення (для журналу/адмінки). */
export function explain(r: RiskResult): string[] {
  const lines: string[] = [];
  for (const h of r.hardReasons) lines.push(`⛔ ${h}`);
  for (const s of r.signals) lines.push(`+${s.weight} ${s.label}: ${s.explanation}`);
  for (const c of r.combos) {
    lines.push(`⚠ Комбінація «${c.label}»${c.addScore ? ` +${c.addScore}` : ""}${c.forceLevel ? ` → ризик ${c.forceLevel}` : ""}`);
  }
  return lines;
}

/** Нормалізація імені для порівняння (регістр, апострофи, порядок слів, латиниця/кирилиця не транслітеруються). */
export function normalizeName(n: string): string {
  return n
    .toLowerCase()
    .replace(/[’'`ʼ.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

/** Ім'я відправника збігається, якщо збігаються всі слова (порядок не важливий) або прізвище + ініціал. */
export function namesMatch(expected: string, actual: string): boolean {
  const a = normalizeName(expected);
  const b = normalizeName(actual);
  if (a === b) return true;
  const wa = a.split(" ");
  const wb = b.split(" ");
  // Банки часто показують «Прізвище І.» — допускаємо збіг повного слова + першої літери іншого.
  const full = wb.filter((w) => w.length > 1 && wa.includes(w));
  if (full.length === 0) return false;
  const rest = wb.filter((w) => !full.includes(w));
  return rest.every((w) => wa.some((x) => !full.includes(x) && x.startsWith(w)));
}
