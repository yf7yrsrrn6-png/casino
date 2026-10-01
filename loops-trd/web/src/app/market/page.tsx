"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Empty, Field, Input, Modal, PageTitle, Select, Spinner, Tabs } from "@/components/ui";
import { Guard } from "@/components/shell";
import { OfferForm, PAYMENT_METHODS } from "@/components/offer-form";
import { useMe } from "@/components/session";
import { api, errorText } from "@/lib/api";
import { fmtNum, fmtUah } from "@/lib/format";

interface Offer {
  id: string;
  user_id: string;
  side: "buy" | "sell";
  price_uah: string;
  min_usdt: string;
  max_usdt: string;
  payment_methods: string[];
  terms: string | null;
  display_name: string | null;
  successful_deals: number | null;
  disputes_lost: number | null;
}

export default function MarketPage() {
  return (
    <Guard>
      <Market />
    </Guard>
  );
}

function Market() {
  const me = useMe();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [method, setMethod] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Offer | null>(null);
  // «Купити USDT» показує оголошення продавців (side = sell).
  const side = tab === "buy" ? "sell" : "buy";
  const q = useQuery({
    queryKey: ["offers", side, method],
    queryFn: () => api<{ offers: Offer[] }>(`/api/offers?side=${side}${method ? `&method=${encodeURIComponent(method)}` : ""}`),
    refetchInterval: 30_000,
  });
  const myId = me.data?.actor?.id;

  return (
    <div>
      <PageTitle
        title="Ринок"
        sub={me.data?.limits ? `Ваш ліміт: ${fmtNum(me.data.limits.single)} USDT разово · ${fmtNum(me.data.limits.daily)} USDT на добу` : undefined}
        actions={<Button onClick={() => setCreating(true)}>+ Оголошення</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "buy", label: "Купити USDT" },
            { value: "sell", label: "Продати USDT" },
          ]}
        />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!h-10 !w-auto min-w-44">
          <option value="">Усі способи оплати</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </div>

      {q.isLoading ? (
        <div className="py-16 flex justify-center text-ink-3">
          <Spinner />
        </div>
      ) : !q.data?.offers.length ? (
        <Empty title="Оголошень поки немає">Створіть перше — друзі побачать його тут.</Empty>
      ) : (
        <div className="grid gap-3">
          {q.data.offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-line bg-surface/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 sm:w-52 shrink-0">
                <div className="h-10 w-10 rounded-xl bg-surface-3 border border-line flex items-center justify-center font-semibold text-ink-2">
                  {(o.display_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.display_name ?? "Учасник"}</div>
                  <div className="text-xs text-ink-3">
                    {o.successful_deals ?? 0} угод{o.disputes_lost ? ` · ${o.disputes_lost} програних спорів` : ""}
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-ink-3">Ціна</div>
                  <div className="text-lg font-semibold tabular">{fmtUah(o.price_uah)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">Ліміт</div>
                  <div className="text-sm tabular">
                    {fmtNum(o.min_usdt)} – {fmtNum(o.max_usdt)} USDT
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 flex flex-wrap gap-1">
                  {o.payment_methods.map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </div>
              </div>
              {o.user_id === myId ? (
                <Badge tone="brand">Ваше</Badge>
              ) : (
                <Button variant={tab === "buy" ? "ok" : "danger"} onClick={() => setSelected(o)} className="sm:w-28">
                  {tab === "buy" ? "Купити" : "Продати"}
                </Button>
              )}
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
      <Modal open={!!selected} onClose={() => setSelected(null)} title={tab === "buy" ? "Купити USDT" : "Продати USDT"}>
        {selected && <Respond offer={selected} buying={tab === "buy"} />}
      </Modal>
    </div>
  );
}

function Respond({ offer, buying }: { offer: Offer; buying: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(offer.payment_methods[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(amount.replace(",", "."));
  const total = n * Number(offer.price_uah);

  const go = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { deal } = await api<{ deal: { id: string } }>("/api/deals", { body: { offerId: offer.id, amountUsdt: n, paymentMethod: method } });
      router.push(`/deals/${deal.id}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2 border border-line p-3 text-sm flex justify-between">
        <span className="text-ink-3">Ціна</span>
        <span className="font-semibold tabular">{fmtUah(offer.price_uah)} за 1 USDT</span>
      </div>
      <Field label={`Сума, USDT (${fmtNum(offer.min_usdt)} – ${fmtNum(offer.max_usdt)})`}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" autoFocus />
      </Field>
      <Field label="Спосіб оплати">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {offer.payment_methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-between text-sm">
        <span className="text-ink-3">{buying ? "Ви заплатите" : "Ви отримаєте"}</span>
        <span className="text-lg font-semibold tabular">{n > 0 ? fmtUah(total) : "—"}</span>
      </div>
      <Alert tone="warn">
        {buying
          ? "Платіть лише після того, як продавець внесе USDT в ескроу. Перекази — лише з вашої верифікованої картки."
          : "Після створення угоди внесіть USDT в ескроу протягом 30 хв. Підтверджуйте отримання лише після надходження коштів у банк, не за скріншотом."}
      </Alert>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button className="w-full" size="lg" onClick={go} loading={busy} disabled={!(n > 0)}>
        Створити угоду
      </Button>
    </div>
  );
}
