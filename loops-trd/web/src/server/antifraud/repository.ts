import type { Db } from "../db";
import { one } from "../db";
import type { RequestMeta } from "../auth";
import { DEFAULT_CONFIG, mergeConfig, type AntifraudConfig, SIGNAL_CODES, type SignalCode } from "./config";
import { computeLimits } from "./limits";
import type { AmlProvider, IpIntelProvider } from "./providers";
import type { PartyFacts, PartyRole, RiskResult, Stage } from "./engine";

export async function loadConfig(db: Db): Promise<AntifraudConfig> {
  const row = await one<{ value: unknown }>(db, `select value from antifraud_settings where key = 'config'`);
  return row ? mergeConfig(row.value) : DEFAULT_CONFIG;
}

export async function saveConfig(db: Db, cfg: AntifraudConfig, by: string) {
  await db.query(
    `insert into antifraud_settings (key, value, updated_by, updated_at) values ('config', $1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(cfg), by],
  );
}

/** Фіксує пристрій та IP користувача (для графа зв'язків і сигналів). */
export async function recordDevice(db: Db, userId: string, meta: RequestMeta, ipIntel?: IpIntelProvider) {
  if (meta.deviceHash) {
    await db.query(
      `insert into user_devices (user_id, device_hash, user_agent, timezone) values ($1, $2, $3, $4)
       on conflict (user_id, device_hash) do update
         set last_seen = now(), seen_count = user_devices.seen_count + 1,
             user_agent = excluded.user_agent, timezone = excluded.timezone`,
      [userId, meta.deviceHash, meta.userAgent, meta.timezone],
    );
  }
  if (meta.ip) {
    const proxy = ipIntel ? (await ipIntel.check(meta.ip, meta.proxyHints)).proxy : meta.proxyHints.length > 0;
    await db.query(
      `insert into user_ips (user_id, ip, proxy_suspected) values ($1, $2, $3)
       on conflict (user_id, ip) do update
         set last_seen = now(), seen_count = user_ips.seen_count + 1, proxy_suspected = excluded.proxy_suspected`,
      [userId, meta.ip, proxy],
    );
  }
}

interface ProfileRow {
  id: string;
  wallet_address: string;
  card_last4: string | null;
  card_holder_name: string | null;
  created_at: Date;
  successful_deals: number;
  disputes_count: number;
  disputes_lost: number;
  single_limit_override: string | null;
  daily_limit_override: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function gatherParty(
  db: Db,
  opts: {
    userId: string;
    role: PartyRole;
    dealId: string | null;
    meta: RequestMeta | null;
    cfg: AntifraudConfig;
    aml: AmlProvider;
    ipIntel: IpIntelProvider;
    now: Date;
  },
): Promise<PartyFacts> {
  const { userId: u, dealId, meta, cfg, now } = opts;
  const p = await one<ProfileRow>(
    db,
    `select id, wallet_address, card_last4, card_holder_name, created_at, successful_deals, disputes_count,
            disputes_lost, single_limit_override, daily_limit_override
     from profiles where id = $1`,
    [u],
  );
  if (!p) throw new Error("profile not found");

  // Пристрій та IP: для ініціатора — з поточного запиту, для іншої сторони — останні відомі.
  const device = await one<{ device_hash: string; first_seen: Date; timezone: string | null }>(
    db,
    meta?.deviceHash
      ? `select device_hash, first_seen, timezone from user_devices where user_id = $1 and device_hash = $2`
      : `select device_hash, first_seen, timezone from user_devices where user_id = $1 order by last_seen desc limit 1`,
    meta?.deviceHash ? [u, meta.deviceHash] : [u],
  );
  const ipRow = await one<{ ip: string; proxy_suspected: boolean }>(
    db,
    meta?.ip
      ? `select ip, proxy_suspected from user_ips where user_id = $1 and ip = $2`
      : `select ip, proxy_suspected from user_ips where user_id = $1 order by last_seen desc limit 1`,
    meta?.ip ? [u, meta.ip] : [u],
  );
  const deviceHash = meta?.deviceHash ?? device?.device_hash ?? null;
  const ip = meta?.ip ?? ipRow?.ip ?? null;
  const ipIntel = meta ? await opts.ipIntel.check(meta.ip, meta.proxyHints) : null;

  const devicesRecent = (
    await db.query<{ device_hash: string }>(
      `select device_hash from user_devices where user_id = $1 and last_seen > $2::timestamptz - interval '30 days'`,
      [u, now],
    )
  ).rows.map((r) => r.device_hash);
  const ipsRecent = (
    await db.query<{ ip: string }>(
      `select ip from user_ips where user_id = $1 and last_seen > $2::timestamptz - interval '30 days'`,
      [u, now],
    )
  ).rows.map((r) => r.ip);
  if (deviceHash && !devicesRecent.includes(deviceHash)) devicesRecent.push(deviceHash);
  if (ip && !ipsRecent.includes(ip)) ipsRecent.push(ip);

  const blacklistHits = (
    await db.query<{ kind: string; value: string; reason: string }>(
      `select kind::text, value, reason from blacklist
       where (kind = 'wallet' and value = $1)
          or (kind = 'card' and value = $2)
          or (kind = 'device' and value = any($3::text[]))
          or (kind = 'ip' and value = any($4::text[]))`,
      [p.wallet_address, p.card_last4 ?? "", devicesRecent, ipsRecent],
    )
  ).rows;

  const vol = await one<{ v24: string; c1h: string; v30: string }>(
    db,
    `select
       coalesce(sum(amount_usdt) filter (where created_at > $2::timestamptz - interval '24 hours'), 0) as v24,
       count(*) filter (where created_at > $2::timestamptz - interval '1 hour') as c1h,
       coalesce(sum(amount_usdt) filter (
         where created_at <= $2::timestamptz - interval '24 hours'
           and created_at > $2::timestamptz - interval '31 days'
           and status in ('released', 'resolved')), 0) as v30
     from deals
     where (buyer_id = $1 or seller_id = $1)
       and status not in ('cancelled', 'blocked')
       and ($3::uuid is null or id <> $3::uuid)`,
    [u, now, dealId],
  );
  const median = await one<{ m: string | null }>(
    db,
    `select percentile_cont(0.5) within group (order by amount_usdt) as m
     from deals where (buyer_id = $1 or seller_id = $1) and status = 'released' and ($2::uuid is null or id <> $2::uuid)`,
    [u, dealId],
  );
  const hours = (
    await db.query<{ h: number }>(
      `select extract(hour from created_at at time zone 'Europe/Kyiv')::int as h
       from deals where (buyer_id = $1 or seller_id = $1) and status = 'released'
       order by created_at desc limit 50`,
      [u],
    )
  ).rows.map((r) => Number(r.h));

  const deviceShared = deviceHash
    ? num(
        (
          await one<{ c: string }>(
            db,
            `select count(distinct user_id) as c from user_devices where device_hash = $1 and user_id <> $2`,
            [deviceHash, u],
          )
        )?.c,
      )
    : 0;
  const ipShared = ip
    ? num(
        (await one<{ c: string }>(db, `select count(distinct user_id) as c from user_ips where ip = $1 and user_id <> $2`, [ip, u]))?.c,
      )
    : 0;
  const cardShared = p.card_last4
    ? num(
        (
          await one<{ c: string }>(
            db,
            `select count(distinct user_id) as c from card_history
             where card_last4 = $1 and lower(card_holder_name) = lower($2) and user_id <> $3`,
            [p.card_last4, p.card_holder_name ?? "", u],
          )
        )?.c,
      )
    : 0;
  const walletShared = num(
    (
      await one<{ c: string }>(
        db,
        `select count(distinct user_id) as c from wallet_history where wallet_address = $1 and user_id <> $2`,
        [p.wallet_address, u],
      )
    )?.c,
  );

  const limits = computeLimits(cfg.limits.tiers, p.successful_deals, {
    single: p.single_limit_override ? Number(p.single_limit_override) : null,
    daily: p.daily_limit_override ? Number(p.daily_limit_override) : null,
  });

  const aml = await opts.aml.checkAddress(p.wallet_address).catch(() => ({ level: "unknown" as const, source: opts.aml.name }));

  return {
    role: opts.role,
    userId: u,
    wallet: p.wallet_address,
    cardLast4: p.card_last4,
    cardHolderName: p.card_holder_name,
    accountAgeDays: (now.getTime() - new Date(p.created_at).getTime()) / 86_400_000,
    successfulDeals: p.successful_deals,
    disputesCount: p.disputes_count,
    disputesLost: p.disputes_lost,
    blacklistHits,
    singleLimit: limits.single,
    dailyLimit: limits.daily,
    volume24h: num(vol?.v24),
    deals1h: num(vol?.c1h),
    avgDailyVolume30d: num(vol?.v30) / 30,
    medianAmount: median?.m == null ? null : Number(median.m),
    usualHours: hours,
    device: deviceHash
      ? {
          hash: deviceHash,
          firstSeenHoursAgo: device ? (now.getTime() - new Date(device.first_seen).getTime()) / 3_600_000 : 0,
          sharedWithUsers: deviceShared,
        }
      : null,
    ipSharedWithUsers: ipShared,
    proxySuspected: ipIntel ? ipIntel.proxy : (ipRow?.proxy_suspected ?? false),
    proxyReasons: ipIntel?.reasons ?? (ipRow?.proxy_suspected ? ["раніше виявлено ознаки проксі"] : []),
    timezone: meta?.timezone ?? device?.timezone ?? null,
    cardSharedWithUsers: cardShared,
    walletSharedWithUsers: walletShared,
    aml,
  };
}

/** Спільні пристрої/IP/картки між двома акаунтами. */
export async function linksBetween(db: Db, a: string, b: string): Promise<string[]> {
  const r = await one<{ dev: string; ip: string; card: string; wallet: string }>(
    db,
    `select
       (select count(*) from user_devices x join user_devices y on x.device_hash = y.device_hash
         where x.user_id = $1 and y.user_id = $2) as dev,
       (select count(*) from user_ips x join user_ips y on x.ip = y.ip where x.user_id = $1 and y.user_id = $2) as ip,
       (select count(*) from card_history x join card_history y
          on x.card_last4 = y.card_last4 and lower(x.card_holder_name) = lower(y.card_holder_name)
         where x.user_id = $1 and y.user_id = $2) as card,
       (select count(*) from wallet_history x join wallet_history y on x.wallet_address = y.wallet_address
         where x.user_id = $1 and y.user_id = $2) as wallet`,
    [a, b],
  );
  const out: string[] = [];
  if (num(r?.dev) > 0) out.push("спільний пристрій");
  if (num(r?.ip) > 0) out.push("спільна IP-адреса");
  if (num(r?.card) > 0) out.push("спільна картка");
  if (num(r?.wallet) > 0) out.push("спільний гаманець");
  return out;
}

export async function saveAssessment(
  db: Db,
  a: { userId: string; dealId: string | null; stage: Stage; result: RiskResult; context?: Record<string, unknown> },
) {
  const signals = [
    ...a.result.signals,
    ...a.result.combos.map((c) => ({
      code: `combo:${c.id}`,
      party: c.party,
      layer: 3,
      weight: c.addScore,
      label: c.label,
      explanation: `Комбіноване правило${c.forceLevel ? ` → ризик ${c.forceLevel}` : ""}`,
    })),
    ...a.result.hardReasons.map((r) => ({ code: `hard:${a.result.hardRule}`, party: "deal", layer: 1, weight: 0, label: "Жорстке правило", explanation: r })),
  ];
  const row = await one<{ id: string }>(
    db,
    `insert into risk_assessments (user_id, deal_id, stage, score, level, decision, hard_rule, signals, context)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      a.userId,
      a.dealId,
      a.stage,
      a.result.score,
      a.result.level,
      a.result.decision,
      a.result.hardRule,
      JSON.stringify(signals),
      JSON.stringify(a.context ?? {}),
    ],
  );
  return row!.id;
}

export interface SignalStat {
  code: string;
  label: string;
  firedOnFraud: number;
  firedOnHonest: number;
  precision: number | null;
  recall: number | null;
}

/**
 * Точність сигналів за розміченими спорами (fraud / honest).
 * precision — частка спрацювань на шахрайських угодах; recall — частка шахрайських угод, де сигнал спрацював.
 */
export async function signalStats(db: Db): Promise<{ totals: { fraud: number; honest: number }; signals: SignalStat[] }> {
  const rows = (
    await db.query<{ deal_id: string; label: "fraud" | "honest"; codes: string[] | null }>(
      `select d.deal_id, d.fraud_label::text as label,
              (select array_agg(distinct s->>'code') from risk_assessments ra, jsonb_array_elements(ra.signals) s
                where ra.deal_id = d.deal_id) as codes
       from disputes d where d.fraud_label is not null`,
    )
  ).rows;
  const totals = { fraud: 0, honest: 0 };
  const map = new Map<string, { f: number; h: number }>();
  for (const r of rows) {
    totals[r.label]++;
    for (const c of r.codes ?? []) {
      const m = map.get(c) ?? { f: 0, h: 0 };
      if (r.label === "fraud") m.f++;
      else m.h++;
      map.set(c, m);
    }
  }
  const { SIGNAL_LABELS } = await import("./config");
  const codes = new Set<string>([...SIGNAL_CODES, ...map.keys()]);
  const signals = [...codes].map((code) => {
    const m = map.get(code) ?? { f: 0, h: 0 };
    return {
      code,
      label: SIGNAL_LABELS[code as SignalCode] ?? code,
      firedOnFraud: m.f,
      firedOnHonest: m.h,
      precision: m.f + m.h > 0 ? m.f / (m.f + m.h) : null,
      recall: totals.fraud > 0 ? m.f / totals.fraud : null,
    };
  });
  signals.sort((a, b) => b.firedOnFraud + b.firedOnHonest - (a.firedOnFraud + a.firedOnHonest));
  return { totals, signals };
}

export interface GraphLink {
  kind: "device" | "ip" | "card" | "wallet" | "deal";
  value: string;
  users: { id: string; display_name: string | null; status: string; wallet_address: string }[];
}

/** Граф зв'язків користувача: спільні пристрої, IP, картки, гаманці + контрагенти угод. */
export async function userGraph(db: Db, userId: string): Promise<GraphLink[]> {
  const q = async (kind: GraphLink["kind"], sql: string) =>
    (await db.query<{ value: string; users: GraphLink["users"] }>(sql, [userId])).rows.map((r) => ({ kind, ...r }));
  const usersAgg = `json_agg(distinct jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status, 'wallet_address', p.wallet_address))`;
  return [
    ...(await q(
      "device",
      `select x.device_hash as value, ${usersAgg} as users from user_devices x
       join user_devices y on y.device_hash = x.device_hash and y.user_id <> x.user_id
       join profiles p on p.id = y.user_id where x.user_id = $1 group by x.device_hash`,
    )),
    ...(await q(
      "ip",
      `select x.ip as value, ${usersAgg} as users from user_ips x
       join user_ips y on y.ip = x.ip and y.user_id <> x.user_id
       join profiles p on p.id = y.user_id where x.user_id = $1 group by x.ip`,
    )),
    ...(await q(
      "card",
      `select '*' || x.card_last4 || ' ' || x.card_holder_name as value, ${usersAgg} as users from card_history x
       join card_history y on y.card_last4 = x.card_last4 and lower(y.card_holder_name) = lower(x.card_holder_name)
         and y.user_id <> x.user_id
       join profiles p on p.id = y.user_id where x.user_id = $1 group by x.card_last4, x.card_holder_name`,
    )),
    ...(await q(
      "wallet",
      `select x.wallet_address as value, ${usersAgg} as users from wallet_history x
       join wallet_history y on y.wallet_address = x.wallet_address and y.user_id <> x.user_id
       join profiles p on p.id = y.user_id where x.user_id = $1 group by x.wallet_address`,
    )),
    ...(await q(
      "deal",
      `select count(*)::text || ' угод' as value, ${usersAgg} as users
       from deals d join profiles p on p.id = case when d.buyer_id = $1 then d.seller_id else d.buyer_id end
       where d.buyer_id = $1 or d.seller_id = $1 group by p.id`,
    )),
  ];
}
