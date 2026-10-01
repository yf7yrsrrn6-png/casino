"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Empty, PageTitle, Spinner, Tabs } from "@/components/ui";
import { Guard } from "@/components/shell";
import { useMe } from "@/components/session";
import { api } from "@/lib/api";
import { DEAL_STATUS, fmtDate, fmtNum, fmtUah } from "@/lib/format";

interface DealRow {
  id: string;
  seller_id: string;
  buyer_id: string;
  amount_usdt: string;
  total_uah: string;
  price_uah: string;
  status: string;
  frozen: boolean;
  payment_method: string;
  created_at: string;
  seller_name: string | null;
  buyer_name: string | null;
}

export default function DealsPage() {
  return (
    <Guard need="auth">
      <Deals />
    </Guard>
  );
}

function Deals() {
  const me = useMe();
  const [status, setStatus] = useState<"active" | "closed" | "all">("active");
  const [role, setRole] = useState<"all" | "buyer" | "seller">("all");
  const q = useQuery({
    queryKey: ["deals", status, role],
    queryFn: () => api<{ deals: DealRow[] }>(`/api/deals?status=${status}&role=${role}`),
    refetchInterval: 15_000,
  });
  const myId = me.data?.actor?.id;

  return (
    <div>
      <PageTitle title="Мої угоди" />
      <div className="mb-4 flex flex-wrap gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: "active", label: "Активні" },
            { value: "closed", label: "Завершені" },
            { value: "all", label: "Усі" },
          ]}
        />
        <Tabs
          value={role}
          onChange={setRole}
          items={[
            { value: "all", label: "Усі ролі" },
            { value: "buyer", label: "Купую" },
            { value: "seller", label: "Продаю" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <div className="py-16 flex justify-center text-ink-3">
          <Spinner />
        </div>
      ) : !q.data?.deals.length ? (
        <Empty title="Угод не знайдено">
          <Link href="/market" className="text-brand">
            Перейти на ринок →
          </Link>
        </Empty>
      ) : (
        <div className="grid gap-2">
          {q.data.deals.map((d) => {
            const buying = d.buyer_id === myId;
            const st = DEAL_STATUS[d.status];
            return (
              <Link key={d.id} href={`/deals/${d.id}`} className="rounded-2xl border border-line bg-surface/80 hover:bg-surface-2 transition p-4 flex items-center gap-4">
                <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold ${buying ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"}`}>
                  {buying ? "↓" : "↑"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium tabular">
                    {buying ? "Купівля" : "Продаж"} {fmtNum(d.amount_usdt)} USDT
                  </div>
                  <div className="text-xs text-ink-3 truncate">
                    {buying ? d.seller_name : d.buyer_name} · {d.payment_method} · {fmtDate(d.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">{fmtUah(d.total_uah)}</div>
                  <div className="mt-1 flex gap-1 justify-end">
                    {d.frozen && <Badge tone="bad">Заморожено</Badge>}
                    <Badge tone={st?.tone}>{st?.label ?? d.status}</Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
