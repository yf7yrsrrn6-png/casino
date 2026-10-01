"use client";

import Link from "next/link";
import { Badge, Empty } from "./ui";
import { DEAL_STATUS, EVENT_LABEL, RISK, fmtDate, fmtNum, shortAddr } from "@/lib/format";

export interface QueueDispute {
  id: string;
  deal_id: string;
  reason: string;
  status: string;
  amount_usdt: string;
  frozen?: boolean;
  seller_name: string | null;
  buyer_name: string | null;
  created_at: string;
  recommendation?: string | null;
}
export interface QueueDeal {
  id: string;
  amount_usdt: string;
  status: string;
  frozen: boolean;
  risk_level: string | null;
  risk_score: number | null;
  release_check: string | null;
  release_check_done: boolean;
  seller_name: string | null;
  buyer_name: string | null;
  created_at: string;
}

export function DisputeList({ items, empty = "Відкритих спорів немає" }: { items: QueueDispute[]; empty?: string }) {
  if (!items.length) return <Empty title={empty} />;
  return (
    <div className="grid gap-2">
      {items.map((d) => (
        <Link key={d.id} href={`/deals/${d.deal_id}`} className="rounded-2xl border border-line bg-surface/80 hover:bg-surface-2 p-4 block">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium tabular">
              {fmtNum(d.amount_usdt)} USDT · {d.seller_name} → {d.buyer_name}
            </div>
            <div className="flex gap-1">
              {d.frozen && <Badge tone="bad">заморожено</Badge>}
              <Badge tone={d.status === "recommended" ? "warn" : d.status === "resolved" ? "ok" : "bad"}>
                {d.status === "recommended" ? "є рекомендація" : d.status === "resolved" ? "вирішено" : "новий"}
              </Badge>
            </div>
          </div>
          <div className="mt-1 text-sm text-ink-2 line-clamp-2">{d.reason}</div>
          <div className="mt-1 text-xs text-ink-3">{fmtDate(d.created_at)}</div>
        </Link>
      ))}
    </div>
  );
}

export function FlaggedList({ items }: { items: QueueDeal[] }) {
  if (!items.length) return <Empty title="Зупинених чи ризикових угод немає" />;
  return (
    <div className="grid gap-2">
      {items.map((d) => (
        <Link key={d.id} href={`/deals/${d.id}`} className="rounded-2xl border border-line bg-surface/80 hover:bg-surface-2 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium tabular">
              {fmtNum(d.amount_usdt)} USDT · {d.seller_name} → {d.buyer_name}
            </div>
            <div className="text-xs text-ink-3">{fmtDate(d.created_at)}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {d.frozen && <Badge tone="bad">заморожено</Badge>}
            {d.release_check === "staff" && !d.release_check_done && <Badge tone="warn">потрібна перевірка</Badge>}
            {d.risk_level && <Badge tone={RISK[d.risk_level]?.tone}>{RISK[d.risk_level]?.label} · {d.risk_score}</Badge>}
            <Badge tone={DEAL_STATUS[d.status]?.tone}>{DEAL_STATUS[d.status]?.label}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

export interface EventRow {
  id: number;
  deal_id: string;
  action: string;
  actor_wallet: string | null;
  tx_hash: string | null;
  created_at: string;
}
export interface StaffActionRow {
  id: number;
  actor_name: string | null;
  actor_wallet: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  signature: string | null;
  created_at: string;
}

export function EventsTable({ items }: { items: EventRow[] }) {
  if (!items.length) return <Empty title="Подій немає" />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-ink-3 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Час</th>
            <th className="px-3 py-2 font-medium">Гаманець</th>
            <th className="px-3 py-2 font-medium">Дія</th>
            <th className="px-3 py-2 font-medium">Угода</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} className="border-t border-line/60">
              <td className="px-3 py-2 whitespace-nowrap text-ink-3">{fmtDate(e.created_at)}</td>
              <td className="px-3 py-2 font-mono text-xs">{e.actor_wallet === "system" ? "система" : shortAddr(e.actor_wallet)}</td>
              <td className="px-3 py-2">{EVENT_LABEL[e.action] ?? e.action}</td>
              <td className="px-3 py-2">
                <Link className="text-brand-2 hover:underline font-mono text-xs" href={`/deals/${e.deal_id}`}>
                  {e.deal_id.slice(0, 8)}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StaffActionsTable({ items }: { items: StaffActionRow[] }) {
  if (!items.length) return <Empty title="Дій персоналу ще немає" />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-ink-3 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Час</th>
            <th className="px-3 py-2 font-medium">Хто</th>
            <th className="px-3 py-2 font-medium">Дія</th>
            <th className="px-3 py-2 font-medium">Об&apos;єкт</th>
            <th className="px-3 py-2 font-medium">Підпис</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-t border-line/60 align-top">
              <td className="px-3 py-2 whitespace-nowrap text-ink-3">{fmtDate(a.created_at)}</td>
              <td className="px-3 py-2">
                {a.actor_name ?? "—"}
                <div className="font-mono text-[11px] text-ink-3">{shortAddr(a.actor_wallet)}</div>
              </td>
              <td className="px-3 py-2">
                <code className="text-xs">{a.action}</code>
                <div className="text-[11px] text-ink-3 max-w-xs truncate">{JSON.stringify(a.details)}</div>
              </td>
              <td className="px-3 py-2 text-xs">
                {a.target_type === "deal" ? (
                  <Link className="text-brand-2 hover:underline" href={`/deals/${a.target_id}`}>
                    угода {a.target_id?.slice(0, 8)}
                  </Link>
                ) : (
                  `${a.target_type ?? ""} ${a.target_id?.slice(0, 12) ?? ""}`
                )}
              </td>
              <td className="px-3 py-2">{a.signature ? <Badge tone="ok">✓ гаманець</Badge> : <span className="text-ink-3">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
