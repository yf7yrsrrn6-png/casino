"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, PageTitle, Spinner, Stat } from "@/components/ui";
import { Guard } from "@/components/shell";
import { AdminNav } from "@/components/admin-nav";
import { DisputeList, type QueueDispute } from "@/components/staff-lists";
import { api } from "@/lib/api";
import { DEAL_STATUS, RISK, fmtDate, fmtNum } from "@/lib/format";

interface Dash {
  stats: Record<string, string>;
  recent: { id: string; amount_usdt: string; status: string; frozen: boolean; risk_level: string | null; created_at: string; seller_name: string; buyer_name: string }[];
  daily: { day: string; deals: string; volume: string }[];
  gas: { address: string; balance: string; low: boolean } | null;
  keeperLastRun: string | null;
  system: { id: number; level: string; source: string; message: string; created_at: string }[];
}

export default function AdminPage() {
  return (
    <Guard roles={["admin"]}>
      <Admin />
    </Guard>
  );
}

function Admin() {
  const q = useQuery({ queryKey: ["admin-dash"], queryFn: () => api<Dash>("/api/admin/dashboard"), refetchInterval: 30_000 });
  const queue = useQuery({ queryKey: ["mod-queue"], queryFn: () => api<{ disputes: QueueDispute[]; resolvedUnlabeled: QueueDispute[] }>("/api/mod/queue") });
  if (q.isLoading || !q.data) return <Spinner />;
  const s = q.data.stats;
  const max = Math.max(1, ...q.data.daily.map((d) => Number(d.volume)));
  return (
    <div>
      <PageTitle title="Адмінка" sub="Огляд площадки Loops Trd" />
      <AdminNav />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Угод усього" value={s.deals_total} sub={`активних: ${s.deals_active}`} />
        <Stat label="Обсяг (завершені)" value={`${fmtNum(s.volume_usdt)}`} sub={`USDT · за 24 год: ${fmtNum(s.volume_24h)}`} />
        <Stat label="Відкриті спори" value={s.disputes_open} tone={Number(s.disputes_open) ? "bad" : undefined} sub={`заморожено: ${s.frozen}`} />
        <Link href="/admin/users">
          <Stat label="Нові заявки" value={s.applications} tone={Number(s.applications) ? "warn" : undefined} sub={`запитів на зміну: ${s.change_requests} · учасників: ${s.members}`} />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card title="Серверний гаманець (газ)">
          {q.data.gas ? (
            <div className="text-sm">
              <div className={`text-xl font-semibold tabular ${q.data.gas.low ? "text-bad" : ""}`}>{Number(q.data.gas.balance).toFixed(4)} tBNB</div>
              <div className="font-mono text-xs text-ink-3 break-all">{q.data.gas.address}</div>
              {q.data.gas.low && <div className="mt-2 text-bad text-xs">Мало газу: поповніть з фаусета, інакше зупиняться відпуск коштів і автоскасування.</div>}
            </div>
          ) : (
            <p className="text-sm text-ink-3">Контракт не налаштовано або RPC недоступний.</p>
          )}
        </Card>
        <Card title="Кіпер (автоскасування, звірка)">
          {(() => {
            const age = q.data.keeperLastRun ? (Date.parse(q.data.keeperLastRun) - Date.parse(new Date().toISOString())) / -60000 : null;
            return (
              <div className="text-sm">
                <div className={`text-xl font-semibold ${age === null || age > 10 ? "text-bad" : "text-ok"}`}>
                  {age === null ? "ще не запускався" : age < 1 ? "щойно" : `${Math.round(age)} хв тому`}
                </div>
                {(age === null || age > 10) && <div className="mt-1 text-xs text-bad">Перевірте pg_cron / GitHub Actions / воркер (див. README → «Кіпер»).</div>}
              </div>
            );
          })()}
        </Card>
      </div>

      {q.data.system.length > 0 && (
        <Card title="Системні попередження" className="mt-4">
          <ul className="space-y-1.5 text-[13px]">
            {q.data.system.map((e) => (
              <li key={e.id} className="flex gap-2">
                <Badge tone={e.level === "error" ? "bad" : "warn"}>{e.source}</Badge>
                <span className="flex-1 text-ink-2">{e.message}</span>
                <span className="text-[11px] text-ink-3 shrink-0">{fmtDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Обсяг за 14 днів, USDT">
          {q.data.daily.length === 0 ? (
            <p className="text-sm text-ink-3">Даних ще немає.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-40">
              {q.data.daily.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${fmtNum(d.volume)} USDT, ${d.deals} угод`}>
                  <div className="w-full rounded-t-md brand-gradient opacity-90" style={{ height: `${Math.max(3, (Number(d.volume) / max) * 100)}%` }} />
                  <span className="text-[10px] text-ink-3">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Останні угоди">
          <div className="space-y-1">
            {q.data.recent.map((d) => (
              <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 text-[13px] min-w-0">
                <span className="tabular font-medium w-20 sm:w-24 shrink-0">{fmtNum(d.amount_usdt)} USDT</span>
                <span className="flex-1 truncate text-ink-3">
                  {d.seller_name} → {d.buyer_name}
                </span>
                {d.frozen && <Badge tone="bad">❄</Badge>}
                {d.risk_level && d.risk_level !== "low" && <Badge className="hidden sm:inline-flex" tone={RISK[d.risk_level].tone}>{d.risk_level}</Badge>}
                <Badge tone={DEAL_STATUS[d.status]?.tone}>{DEAL_STATUS[d.status]?.label}</Badge>
                <span className="hidden sm:block text-[11px] text-ink-3 w-20 text-right">{fmtDate(d.created_at)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Спори на рішення">
          <DisputeList items={queue.data?.disputes ?? []} />
        </Card>
        <Card title="Вирішені спори без позначки «шахрайство / чесна»">
          <DisputeList items={queue.data?.resolvedUnlabeled ?? []} empty="Усі вирішені спори позначено" />
        </Card>
      </div>
    </div>
  );
}
