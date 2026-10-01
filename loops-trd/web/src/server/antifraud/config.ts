import { z } from "zod";

/** Коди сигналів шару 2. Ваги/параметри редагуються в адмінці (таблиця antifraud_settings). */
export const SIGNAL_CODES = [
  "device_new",
  "device_unknown",
  "device_shared",
  "ip_shared",
  "proxy_suspected",
  "timezone_unusual",
  "card_shared",
  "wallet_shared",
  "counterparty_linked",
  "velocity_1h",
  "velocity_24h",
  "amount_spike",
  "amount_large",
  "unusual_hour",
  "too_fast",
  "account_new",
  "no_history",
  "dispute_history",
  "sender_name_mismatch",
  "aml_medium",
] as const;
export type SignalCode = (typeof SIGNAL_CODES)[number];

export const SIGNAL_LABELS: Record<SignalCode, string> = {
  device_new: "Новий пристрій",
  device_unknown: "Пристрій не визначено",
  device_shared: "Пристрій інших акаунтів",
  ip_shared: "IP інших акаунтів",
  proxy_suspected: "Ознаки VPN/проксі",
  timezone_unusual: "Нетиповий часовий пояс",
  card_shared: "Спільна картка",
  wallet_shared: "Спільний гаманець",
  counterparty_linked: "Сторони угоди пов'язані",
  velocity_1h: "Багато угод за 1 год",
  velocity_24h: "Обсяг за 24 год вище звичного",
  amount_spike: "Різкий ріст суми",
  amount_large: "Велика сума",
  unusual_hour: "Нетиповий час",
  too_fast: "Занадто швидке проходження",
  account_new: "Новий акаунт",
  no_history: "Немає успішних угод",
  dispute_history: "Історія спорів",
  sender_name_mismatch: "Ім'я відправника не збігається",
  aml_medium: "AML: підвищений ризик гаманця",
};

const signalSchema = z.object({
  enabled: z.boolean(),
  weight: z.number().int().min(0).max(100),
  params: z.record(z.string(), z.number()).default({}),
});

const comboSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{2,40}$/),
  label: z.string().min(2).max(120),
  enabled: z.boolean(),
  all: z.array(z.enum(SIGNAL_CODES)).min(2),
  addScore: z.number().int().min(0).max(100).default(0),
  forceLevel: z.enum(["medium", "high"]).nullable().default(null),
});

const tierSchema = z.object({
  minDeals: z.number().int().min(0),
  single: z.number().positive(),
  daily: z.number().positive(),
});

export const antifraudConfigSchema = z
  .object({
    thresholds: z.object({ medium: z.number().int().min(1), high: z.number().int().min(2) }),
    signals: z.object(
      Object.fromEntries(SIGNAL_CODES.map((c) => [c, signalSchema])) as Record<SignalCode, typeof signalSchema>,
    ),
    combos: z.array(comboSchema).max(50),
    limits: z.object({ tiers: z.array(tierSchema).min(1) }),
    /** Що робити при середньому ризику перед відпуском коштів. */
    mediumAction: z.enum(["wallet_signature", "staff"]),
    /** Рівень AML, що блокує жорстко (шар 1). */
    amlBlockLevel: z.enum(["high", "medium"]),
    expectedTimezones: z.array(z.string()).min(1),
  })
  .refine((c) => c.thresholds.high > c.thresholds.medium, { message: "Поріг high має бути більшим за medium" });

export type AntifraudConfig = z.infer<typeof antifraudConfigSchema>;
export type ComboRule = z.infer<typeof comboSchema>;
export type LimitTier = z.infer<typeof tierSchema>;

const s = (weight: number, params: Record<string, number> = {}, enabled = true) => ({ enabled, weight, params });

export const DEFAULT_CONFIG: AntifraudConfig = {
  thresholds: { medium: 30, high: 60 },
  signals: {
    device_new: s(10, { hours: 24 }),
    device_unknown: s(10),
    device_shared: s(30),
    ip_shared: s(10),
    proxy_suspected: s(15),
    timezone_unusual: s(5),
    card_shared: s(35),
    wallet_shared: s(35),
    counterparty_linked: s(40),
    velocity_1h: s(15, { maxCount: 3 }),
    velocity_24h: s(15, { multiplier: 3, minVolume: 100 }),
    amount_spike: s(20, { multiplier: 3 }),
    amount_large: s(10, { amount: 500 }),
    unusual_hour: s(5, { startHour: 1, endHour: 6 }),
    too_fast: s(15, { minPaidSeconds: 60, minReleaseSeconds: 60 }),
    account_new: s(15, { days: 7 }),
    no_history: s(10),
    dispute_history: s(20, { maxLost: 0 }),
    sender_name_mismatch: s(40),
    aml_medium: s(25),
  },
  combos: [
    {
      id: "new_account_device_big_amount",
      label: "Новий акаунт + новий пристрій + велика сума",
      enabled: true,
      all: ["account_new", "device_new", "amount_large"],
      addScore: 0,
      forceLevel: "high",
    },
    {
      id: "shared_device_name_mismatch",
      label: "Чужий пристрій + невідповідність імені відправника",
      enabled: true,
      all: ["device_shared", "sender_name_mismatch"],
      addScore: 0,
      forceLevel: "high",
    },
    {
      id: "proxy_new_account_fast",
      label: "VPN/проксі + новий акаунт + надто швидка угода",
      enabled: true,
      all: ["proxy_suspected", "account_new", "too_fast"],
      addScore: 0,
      forceLevel: "high",
    },
    {
      id: "velocity_spike",
      label: "Багато угод за годину + різкий ріст суми",
      enabled: true,
      all: ["velocity_1h", "amount_spike"],
      addScore: 20,
      forceLevel: null,
    },
  ],
  limits: {
    tiers: [
      { minDeals: 0, single: 100, daily: 300 },
      { minDeals: 3, single: 300, daily: 1000 },
      { minDeals: 10, single: 1000, daily: 3000 },
      { minDeals: 30, single: 3000, daily: 10000 },
    ],
  },
  mediumAction: "wallet_signature",
  amlBlockLevel: "high",
  expectedTimezones: ["Europe/Kyiv", "Europe/Kiev", "Europe/Uzhgorod", "Europe/Zaporozhye"],
};

/** Злиття збереженого конфігу з дефолтом (нові сигнали отримують дефолтні значення). */
export function mergeConfig(stored: unknown): AntifraudConfig {
  if (!stored || typeof stored !== "object") return DEFAULT_CONFIG;
  const st = stored as Partial<AntifraudConfig>;
  const merged = {
    ...DEFAULT_CONFIG,
    ...st,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(st.thresholds ?? {}) },
    signals: Object.fromEntries(
      SIGNAL_CODES.map((c) => [
        c,
        {
          ...DEFAULT_CONFIG.signals[c],
          ...(st.signals?.[c] ?? {}),
          params: { ...DEFAULT_CONFIG.signals[c].params, ...(st.signals?.[c]?.params ?? {}) },
        },
      ]),
    ),
    limits: st.limits ?? DEFAULT_CONFIG.limits,
    combos: st.combos ?? DEFAULT_CONFIG.combos,
  };
  const parsed = antifraudConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}
