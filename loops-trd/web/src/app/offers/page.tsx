"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Empty, Modal, PageTitle, Spinner } from "@/components/ui";
import { Guard } from "@/components/shell";
import { OfferForm } from "@/components/offer-form";
import { api, errorText } from "@/lib/api";
import { fmtDate, fmtNum, fmtUah } from "@/lib/format";
import { useToast } from "@/components/ui";

interface Offer {
  id: string;
  side: "buy" | "sell";
  price_uah: string;
  min_usdt: string;
  max_usdt: string;
  payment_methods: string[];
  is_active: boolean;
  created_at: string;
}

export default function OffersPage() {
  return (
    <Guard>
      <MyOffers />
    </Guard>
  );
}

function MyOffers() {
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const q = useQuery({ queryKey: ["my-offers"], queryFn: () => api<{ offers: Offer[] }>("/api/offers?mine=true") });
  const toggle = async (o: Offer) => {
    try {
      await api(`/api/offers/${o.id}`, { method: "PATCH", body: { is_active: !o.is_active } });
      q.refetch();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };
  return (
    <div>
      <PageTitle title="Мої оголошення" actions={<Button onClick={() => setCreating(true)}>+ Створити</Button>} />
      {q.isLoading ? (
        <div className="py-16 flex justify-center text-ink-3">
          <Spinner />
        </div>
      ) : !q.data?.offers.length ? (
        <Empty title="Ще немає оголошень" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-line bg-surface/80 p-4">
              <div className="flex items-center justify-between">
                <Badge tone={o.side === "sell" ? "bad" : "ok"}>{o.side === "sell" ? "Продаю USDT" : "Купую USDT"}</Badge>
                <Badge tone={o.is_active ? "ok" : "muted"}>{o.is_active ? "Активне" : "Вимкнене"}</Badge>
              </div>
              <div className="mt-3 text-xl font-semibold tabular">{fmtUah(o.price_uah)}</div>
              <div className="text-sm text-ink-3 tabular">
                {fmtNum(o.min_usdt)} – {fmtNum(o.max_usdt)} USDT · {o.payment_methods.join(", ")}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-ink-3">{fmtDate(o.created_at)}</span>
                <Button size="sm" variant={o.is_active ? "secondary" : "ok"} onClick={() => toggle(o)}>
                  {o.is_active ? "Вимкнути" : "Увімкнути"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Нове оголошення">
        <OfferForm
          onDone={() => {
            setCreating(false);
            q.refetch();
          }}
        />
      </Modal>
      {toast.node}
    </div>
  );
}
