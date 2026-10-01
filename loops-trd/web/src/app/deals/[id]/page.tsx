"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, PageTitle, Spinner, useToast } from "@/components/ui";
import { Guard } from "@/components/shell";
import { DealChat } from "@/components/chat";
import { isAdminRole, useMe } from "@/components/session";
import { api, errorText } from "@/lib/api";
import { DEAL_STATUS, RISK, fmtNum, fmtUah } from "@/lib/format";
import { isClosed, type DealView } from "@/components/deal/types";
import { FirstDealGuide, NextStep } from "@/components/deal/next-step";
import { SellerActions } from "@/components/deal/seller-actions";
import { BuyerActions } from "@/components/deal/buyer-actions";
import { DisputeAction } from "@/components/deal/dispute-action";
import { StaffPanel } from "@/components/deal/staff-panel";
import { DealDetails, DealJournal, DealProgress, DisputeCard } from "@/components/deal/details";

export default function DealPage() {
  return (
    <Guard>
      <DealScreen />
    </Guard>
  );
}

function DealScreen() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["deal", id], queryFn: () => api<DealView>(`/api/deals/${id}`), refetchInterval: 8000 });
  const [syncing, setSyncing] = useState(false);

  const refresh = async (withSync = true) => {
    if (withSync) {
      setSyncing(true);
      try {
        await api(`/api/deals/${id}/sync`, { body: {} });
      } catch (e) {
        toast.bad(errorText(e));
      } finally {
        setSyncing(false);
      }
    }
    await qc.invalidateQueries({ queryKey: ["deal", id] });
    await qc.invalidateQueries({ queryKey: ["chat", id] });
  };

  if (q.isLoading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-ink-3">
        <Spinner />
        <span className="text-sm">Завантажуємо угоду…</span>
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="max-w-lg mx-auto py-10 space-y-3">
        <Alert tone="bad">{errorText(q.error) || "Угоду не знайдено"}</Alert>
        <Button variant="secondary" onClick={() => q.refetch()}>
          Спробувати ще раз
        </Button>
      </div>
    );
  }

  const v = q.data;
  const d = v.deal;
  const st = DEAL_STATUS[d.status];
  const actor = me.data!.actor!;
  const props = { v, refresh, toast };
  const title = v.role === "buyer" ? `Купівля ${fmtNum(d.amount_usdt)} USDT` : v.role === "seller" ? `Продаж ${fmtNum(d.amount_usdt)} USDT` : `Угода ${fmtNum(d.amount_usdt)} USDT`;

  return (
    <div>
      <PageTitle
        title={title}
        sub={`${fmtUah(d.total_uah)} · ${fmtUah(d.price_uah)} за 1 USDT · ${d.payment_method}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {d.frozen && <Badge tone="bad">Заморожено</Badge>}
            {v.role === "staff" && d.risk_level && d.risk_level !== "low" && <Badge tone={RISK[d.risk_level].tone}>{RISK[d.risk_level].label}</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
            <Button size="sm" variant="ghost" onClick={() => refresh()} loading={syncing} aria-label="Оновити стан з блокчейну" title="Оновити стан з блокчейну">
              ⟳
            </Button>
          </div>
        }
      />
      <div className="mb-4">
        <DealProgress status={d.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4 min-w-0">
          <NextStep v={v} />
          <FirstDealGuide v={v} />
          {!isClosed(d.status) && v.role !== "staff" && (
            <Alert tone="warn" title="Підтверджуйте лише після надходження коштів у банк, не за скріншотом">
              Перевіряйте зарахування у застосунку свого банку. Відправник має збігатися з верифікованим ім&apos;ям покупця.
            </Alert>
          )}
          {v.role === "seller" && <SellerActions {...props} />}
          {v.role === "buyer" && <BuyerActions {...props} />}
          {(v.role === "buyer" || v.role === "seller") && !isClosed(d.status) && <DisputeAction {...props} />}
          {v.role === "staff" && <StaffPanel {...props} isAdmin={isAdminRole(actor)} />}
          <DealDetails v={v} />
          <DisputeCard v={v} />
          <DealJournal v={v} />
        </div>
        <div className="lg:sticky lg:top-20 self-start">
          <DealChat dealId={d.id} myId={actor.id} closed={isClosed(d.status)} />
        </div>
      </div>
      {toast.node}
    </div>
  );
}
