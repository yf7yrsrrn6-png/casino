"use client";

import { useState } from "react";
import { Alert, Button, Field, Input, Tabs, Textarea, cx } from "./ui";
import { api, errorText } from "@/lib/api";

export const PAYMENT_METHODS = ["Monobank", "ПриватБанк", "ПУМБ", "А-Банк", "Sense Bank", "Ощадбанк", "Райффайзен", "Готівка"];

export function OfferForm({ onDone }: { onDone: () => void }) {
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [f, setF] = useState({ price_uah: "", min_usdt: "", max_usdt: "", terms: "" });
  const [methods, setMethods] = useState<string[]>(["Monobank"]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api("/api/offers", { body: { side, ...f, payment_methods: methods } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(",", ".") });

  return (
    <div className="space-y-4">
      <Tabs
        value={side}
        onChange={setSide}
        items={[
          { value: "sell", label: "Я продаю USDT" },
          { value: "buy", label: "Я купую USDT" },
        ]}
      />
      <Field label="Ціна за 1 USDT, ₴">
        <Input inputMode="decimal" value={f.price_uah} onChange={num("price_uah")} placeholder="41.50" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Мін. сума, USDT">
          <Input inputMode="decimal" value={f.min_usdt} onChange={num("min_usdt")} placeholder="10" />
        </Field>
        <Field label="Макс. сума, USDT">
          <Input inputMode="decimal" value={f.max_usdt} onChange={num("max_usdt")} placeholder="500" />
        </Field>
      </div>
      <Field label="Способи оплати">
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const on = methods.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethods(on ? methods.filter((x) => x !== m) : [...methods, m])}
                className={cx("h-8 px-3 rounded-lg border text-[13px] transition", on ? "border-brand bg-brand/15 text-ink" : "border-line-strong text-ink-3 hover:text-ink-2")}
              >
                {m}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Умови (необов'язково)">
        <Textarea value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} maxLength={500} placeholder="Напр.: відповідаю 9:00–22:00" />
      </Field>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button className="w-full" onClick={submit} loading={busy} disabled={!methods.length}>
        Опублікувати
      </Button>
    </div>
  );
}
