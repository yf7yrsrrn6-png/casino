"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Empty, Field, Input, PageTitle, Select, Spinner, Tabs, cx, useToast } from "@/components/ui";
import { Guard } from "@/components/shell";
import { AdminNav } from "@/components/admin-nav";
import { isAdminRole, useMe, useSignAction } from "@/components/session";
import { api, errorText } from "@/lib/api";
import { RISK, fmtDate, fmtNum, shortAddr } from "@/lib/format";
import type { AntifraudConfig, SignalCode } from "@/server/antifraud/config";
import { SIGNAL_CODES, SIGNAL_LABELS } from "@/server/antifraud/config";

interface Overview {
  config: AntifraudConfig;
  queue: {
    id: string;
    deal_id: string | null;
    display_name: string;
    wallet_address: string;
    stage: string;
    score: number;
    level: string;
    decision: string;
    signals: { code: string; label: string; weight: number; explanation: string; layer: number }[];
    created_at: string;
    amount_usdt: string | null;
  }[];
  stats: {
    totals: { fraud: number; honest: number };
    signals: { code: string; label: string; firedOnFraud: number; firedOnHonest: number; precision: number | null; recall: number | null }[];
  };
  blacklist: { id: string; kind: string; value: string; reason: string; created_at: string }[];
}

export default function AntifraudPage() {
  return (
    <Guard roles={["moderator", "admin"]}>
      <Suspense>
        <Antifraud />
      </Suspense>
    </Guard>
  );
}

type Tab = "queue" | "settings" | "stats" | "blacklist" | "graph";

function Antifraud() {
  const params = useSearchParams();
  const me = useMe();
  const admin = isAdminRole(me.data?.actor);
  const [tab, setTab] = useState<Tab>(params.get("user") ? "graph" : "queue");
  const q = useQuery({ queryKey: ["antifraud"], queryFn: () => api<Overview>("/api/admin/antifraud") });
  const toast = useToast();

  return (
    <div>
      <PageTitle title="Антифрод" sub="Шар 1 — жорсткі правила · Шар 2 — сигнали з вагами · Шар 3 — комбінації" />
      {admin && <AdminNav />}
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "queue", label: "Черга" },
            { value: "settings", label: "Ваги й пороги" },
            { value: "stats", label: "Точність сигналів" },
            { value: "blacklist", label: "Чорний список" },
            { value: "graph", label: "Граф зв'язків" },
          ]}
        />
      </div>
      {q.isLoading || !q.data ? (
        <Spinner />
      ) : tab === "queue" ? (
        <Queue items={q.data.queue} />
      ) : tab === "settings" ? (
        <Settings key={q.dataUpdatedAt} initial={q.data.config} canEdit={admin} toast={toast} onSaved={() => q.refetch()} />
      ) : tab === "stats" ? (
        <Stats s={q.data.stats} />
      ) : tab === "blacklist" ? (
        <Blacklist items={q.data.blacklist} canEdit={admin} toast={toast} onChange={() => q.refetch()} />
      ) : (
        <Graph initialUser={params.get("user") ?? ""} />
      )}
      {toast.node}
    </div>
  );
}

function Queue({ items }: { items: Overview["queue"] }) {
  if (!items.length) return <Empty title="Ризикових оцінок немає" />;
  return (
    <div className="grid gap-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-2xl border border-line bg-surface/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={RISK[r.level]?.tone}>
              {RISK[r.level]?.label} · {r.score}
            </Badge>
            <Badge>{{ allow: "дозволено", confirm: "підтвердження", freeze: "заморожено", block: "заблоковано" }[r.decision] ?? r.decision}</Badge>
            <span className="text-sm font-medium">{r.display_name}</span>
            <span className="text-xs text-ink-3 font-mono">{shortAddr(r.wallet_address)}</span>
            {r.amount_usdt && <span className="text-xs text-ink-3">{fmtNum(r.amount_usdt)} USDT</span>}
            <span className="ml-auto text-xs text-ink-3">{fmtDate(r.created_at)}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {r.signals.map((s, i) => (
              <li key={i} className="text-[13px] text-ink-2">
                <span className={cx("inline-block w-9 font-mono text-right mr-2", s.layer === 1 ? "text-bad" : s.layer === 3 ? "text-warn" : "text-ink-3")}>
                  {s.layer === 1 ? "⛔" : s.layer === 3 ? "⚠" : `+${s.weight}`}
                </span>
                {s.explanation}
              </li>
            ))}
          </ul>
          {r.deal_id && (
            <Link href={`/deals/${r.deal_id}`} className="mt-2 inline-block text-xs text-brand-2 hover:underline">
              Відкрити угоду →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function Settings({ initial, canEdit, toast, onSaved }: { initial: AntifraudConfig; canEdit: boolean; toast: ReturnType<typeof useToast>; onSaved: () => void }) {
  const [c, setC] = useState<AntifraudConfig>(initial);
  const [busy, setBusy] = useState(false);
  const sign = useSignAction();

  const setSignal = (code: SignalCode, patch: Partial<AntifraudConfig["signals"][SignalCode]>) => setC({ ...c, signals: { ...c.signals, [code]: { ...c.signals[code], ...patch } } });
  const int = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  const save = async () => {
    setBusy(true);
    try {
      const signed = await sign("antifraud.config", c);
      await api("/api/admin/antifraud", { method: "PUT", body: { input: c, signed } });
      toast.ok("Налаштування збережено");
      onSaved();
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && <Alert>Редагувати може лише адміністратор.</Alert>}
      <Card title="Пороги та рішення">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Середній ризик від, балів">
            <Input inputMode="numeric" value={c.thresholds.medium} disabled={!canEdit} onChange={(e) => setC({ ...c, thresholds: { ...c.thresholds, medium: int(e.target.value) } })} />
          </Field>
          <Field label="Високий ризик від, балів">
            <Input inputMode="numeric" value={c.thresholds.high} disabled={!canEdit} onChange={(e) => setC({ ...c, thresholds: { ...c.thresholds, high: int(e.target.value) } })} />
          </Field>
          <Field label="Середній ризик →">
            <Select value={c.mediumAction} disabled={!canEdit} onChange={(e) => setC({ ...c, mediumAction: e.target.value as AntifraudConfig["mediumAction"] })}>
              <option value="wallet_signature">підпис продавця гаманцем</option>
              <option value="staff">перевірка модератором/адміном</option>
            </Select>
          </Field>
          <Field label="AML блокує з рівня">
            <Select value={c.amlBlockLevel} disabled={!canEdit} onChange={(e) => setC({ ...c, amlBlockLevel: e.target.value as AntifraudConfig["amlBlockLevel"] })}>
              <option value="high">high</option>
              <option value="medium">medium</option>
            </Select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-3">Низький — автоматично; середній — додаткове підтвердження; високий — угода заморожується, ескроу не відпускає кошти до рішення адміна.</p>
      </Card>

      <Card title="Сигнали (шар 2)">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px]">
            <thead className="text-ink-3 text-left">
              <tr>
                <th className="px-1 py-1.5 font-medium">Увімк.</th>
                <th className="px-1 py-1.5 font-medium">Сигнал</th>
                <th className="px-1 py-1.5 font-medium w-20">Вага</th>
                <th className="px-1 py-1.5 font-medium">Параметри</th>
              </tr>
            </thead>
            <tbody>
              {SIGNAL_CODES.map((code) => {
                const sc = c.signals[code];
                return (
                  <tr key={code} className="border-t border-line/50">
                    <td className="px-1 py-1.5">
                      <input type="checkbox" className="h-4 w-4 accent-[#8b6cff]" checked={sc.enabled} disabled={!canEdit} onChange={(e) => setSignal(code, { enabled: e.target.checked })} />
                    </td>
                    <td className="px-1 py-1.5">
                      {SIGNAL_LABELS[code]}
                      <div className="text-[11px] text-ink-3 font-mono">{code}</div>
                    </td>
                    <td className="px-1 py-1.5">
                      <Input className="!h-8 !text-[13px]" inputMode="numeric" value={sc.weight} disabled={!canEdit} onChange={(e) => setSignal(code, { weight: Math.min(100, int(e.target.value)) })} />
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(sc.params).map(([k, val]) => (
                          <label key={k} className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                            {k}
                            <input
                              className="w-16 h-7 rounded-md border border-line-strong bg-surface-2 px-1.5 text-[12px] text-ink"
                              inputMode="decimal"
                              value={val}
                              disabled={!canEdit}
                              onChange={(e) => setSignal(code, { params: { ...sc.params, [k]: Number(e.target.value) || 0 } })}
                            />
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Комбіновані правила (шар 3)">
        <div className="space-y-2">
          {c.combos.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#8b6cff]"
                checked={r.enabled}
                disabled={!canEdit}
                onChange={(e) => setC({ ...c, combos: c.combos.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })}
              />
              <div className="flex-1 min-w-52">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-[11px] text-ink-3">{r.all.map((x) => SIGNAL_LABELS[x]).join(" + ")}</div>
              </div>
              <label className="text-xs text-ink-3 flex items-center gap-1">
                +бали
                <input
                  className="w-14 h-8 rounded-md border border-line-strong bg-surface-2 px-1.5 text-[13px] text-ink"
                  value={r.addScore}
                  disabled={!canEdit}
                  onChange={(e) => setC({ ...c, combos: c.combos.map((x, j) => (j === i ? { ...x, addScore: Math.min(100, int(e.target.value)) } : x)) })}
                />
              </label>
              <Select
                className="!h-8 !w-32 !text-[13px]"
                value={r.forceLevel ?? ""}
                disabled={!canEdit}
                onChange={(e) => setC({ ...c, combos: c.combos.map((x, j) => (j === i ? { ...x, forceLevel: (e.target.value || null) as "medium" | "high" | null } : x)) })}
              >
                <option value="">без примусу</option>
                <option value="medium">→ medium</option>
                <option value="high">→ high</option>
              </Select>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Ліміти за рівнями (USDT)">
        <div className="space-y-2">
          {c.limits.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              {(["minDeals", "single", "daily"] as const).map((k) => (
                <label key={k} className="text-[11px] text-ink-3">
                  {{ minDeals: "від угод", single: "разовий", daily: "добовий" }[k]}
                  <Input
                    className="!h-9 mt-0.5"
                    inputMode="numeric"
                    value={t[k]}
                    disabled={!canEdit}
                    onChange={(e) => setC({ ...c, limits: { tiers: c.limits.tiers.map((x, j) => (j === i ? { ...x, [k]: int(e.target.value) } : x)) } })}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </Card>

      {canEdit && (
        <div className="sticky bottom-20 md:bottom-4 flex justify-end">
          <Button size="lg" loading={busy} onClick={save}>
            Зберегти (підпис гаманцем)
          </Button>
        </div>
      )}
    </div>
  );
}

function Stats({ s }: { s: Overview["stats"] }) {
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <Card title={`Розмічені спори: шахрайство ${s.totals.fraud} · чесні ${s.totals.honest}`}>
      <p className="mb-3 text-xs text-ink-3">
        Точність — частка спрацювань сигналу на шахрайських угодах (низька = хибні тривоги). Повнота — частка шахрайських угод, де сигнал спрацював.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-ink-3 text-left">
            <tr>
              <th className="py-1.5 font-medium">Сигнал</th>
              <th className="py-1.5 font-medium text-right">На шахрайських</th>
              <th className="py-1.5 font-medium text-right">На чесних</th>
              <th className="py-1.5 font-medium text-right">Точність</th>
              <th className="py-1.5 font-medium text-right">Повнота</th>
            </tr>
          </thead>
          <tbody>
            {s.signals.map((x) => (
              <tr key={x.code} className="border-t border-line/50">
                <td className="py-1.5">{x.label}</td>
                <td className="py-1.5 text-right tabular">{x.firedOnFraud}</td>
                <td className="py-1.5 text-right tabular">{x.firedOnHonest}</td>
                <td className={cx("py-1.5 text-right tabular", x.precision != null && (x.precision >= 0.6 ? "text-ok" : x.precision < 0.3 ? "text-bad" : "text-warn"))}>{pct(x.precision)}</td>
                <td className="py-1.5 text-right tabular">{pct(x.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Blacklist({ items, canEdit, toast, onChange }: { items: Overview["blacklist"]; canEdit: boolean; toast: ReturnType<typeof useToast>; onChange: () => void }) {
  const sign = useSignAction();
  const [f, setF] = useState({ kind: "wallet", value: "", reason: "" });
  const add = async () => {
    try {
      const input = { kind: f.kind, value: f.kind === "wallet" ? f.value.trim().toLowerCase() : f.value.trim(), reason: f.reason.trim() };
      const signed = await sign("blacklist.add", input);
      await api("/api/admin/blacklist", { body: { input, signed } });
      setF({ ...f, value: "", reason: "" });
      onChange();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };
  const remove = async (id: string) => {
    try {
      const signed = await sign("blacklist.remove", { id });
      await api(`/api/admin/blacklist/${id}`, { body: { signed } });
      onChange();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {canEdit && (
        <Card title="Додати">
          <div className="space-y-3">
            <Field label="Тип">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="wallet">Гаманець</option>
                <option value="card">Картка (4 цифри)</option>
                <option value="device">Пристрій (відбиток)</option>
                <option value="ip">IP-адреса</option>
              </Select>
            </Field>
            <Field label="Значення">
              <Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
            <Field label="Причина">
              <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </Field>
            <Button className="w-full" variant="danger" onClick={add} disabled={f.value.trim().length < 3 || f.reason.trim().length < 3}>
              Додати (підпис гаманцем)
            </Button>
          </div>
        </Card>
      )}
      <Card title="Чорний список">
        {!items.length ? (
          <p className="text-sm text-ink-3">Порожньо.</p>
        ) : (
          items.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-1.5 border-b border-line/50 last:border-0 text-[13px]">
              <Badge>{b.kind}</Badge>
              <code className="font-mono text-xs break-all">{b.value}</code>
              <span className="flex-1 text-ink-3 truncate">{b.reason}</span>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => remove(b.id)}>
                  ✕
                </Button>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

interface GraphRes {
  user: { id: string; display_name: string; wallet_address: string; status: string; card_last4: string; card_holder_name: string };
  links: { kind: string; value: string; users: { id: string; display_name: string | null; status: string; wallet_address: string }[] }[];
}

function Graph({ initialUser }: { initialUser: string }) {
  const [user, setUser] = useState(initialUser);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<{ users: { id: string; display_name: string | null; wallet_address: string }[] }>("/api/admin/users") });
  const g = useQuery({ queryKey: ["graph", user], queryFn: () => api<GraphRes>(`/api/admin/graph/${user}`), enabled: !!user });
  const kinds: Record<string, string> = { device: "Пристрій", ip: "IP", card: "Картка", wallet: "Гаманець", deal: "Угоди з" };
  const suspicious = g.data?.links.filter((l) => l.kind !== "deal") ?? [];
  return (
    <div className="space-y-4">
      <Select value={user} onChange={(e) => setUser(e.target.value)} className="max-w-md">
        <option value="">Оберіть учасника…</option>
        {users.data?.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name ?? "—"} · {shortAddr(u.wallet_address)}
          </option>
        ))}
      </Select>
      {g.isLoading && user && <Spinner />}
      {g.data && (
        <Card title={`${g.data.user.display_name ?? "—"} · ${shortAddr(g.data.user.wallet_address)}`}>
          {suspicious.length === 0 ? <Alert tone="ok">Спільних пристроїв, IP, карток чи гаманців з іншими акаунтами не знайдено.</Alert> : <Alert tone="warn">Знайдено спільні ідентифікатори з іншими акаунтами — перевірте на мульти-акаунти.</Alert>}
          <div className="mt-4 relative">
            <div className="mx-auto mb-4 w-fit rounded-2xl border-2 border-brand bg-brand/10 px-4 py-2 text-sm font-semibold">{g.data.user.display_name}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.data.links.map((l, i) => (
                <div key={i} className={cx("rounded-xl border p-3", l.kind === "deal" ? "border-line" : "border-warn/40 bg-warn/5")}>
                  <div className="text-xs text-ink-3">
                    {kinds[l.kind]} <code className="font-mono text-ink-2 break-all">{l.kind === "deal" ? "" : l.value}</code>
                    {l.kind === "deal" && l.value}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.users.map((u) => (
                      <button key={u.id} onClick={() => setUser(u.id)} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1 text-xs hover:border-brand">
                        {u.display_name ?? shortAddr(u.wallet_address)}
                        {u.status !== "approved" && <span className="ml-1 text-bad">({u.status})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
