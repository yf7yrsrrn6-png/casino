"use client";

import { useState } from "react";
import { Alert, Button, Card, Field, Input, useNow } from "../ui";
import { useEscrowTx } from "../use-escrow";
import { api } from "@/lib/api";
import { fmtUah } from "@/lib/format";
import { Busy } from "./busy";
import type { ActionProps } from "./types";
import { useDealAction } from "./use-action";

export function BuyerActions({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const { busy, run } = useDealAction({ refresh, toast });
  const [sender, setSender] = useState(v.buyer.card_holder_name ?? "");
  const now = useNow();
  const pastDeadline = d.payment_deadline ? new Date(d.payment_deadline).getTime() < now : false;

  const paid = () =>
    run("Зберігаємо дані оплати…", async (step) => {
      await tx.ensure(d.buyer_wallet);
      const r = await api<{ mismatch: boolean }>(`/api/deals/${d.id}/paid-intent`, { body: { senderName: sender } });
      if (r.mismatch) toast.bad("Ім'я відправника не збігається з верифікованим — угоду перевірить модератор.");
      step("Підтвердьте «Я оплатив» у гаманці…");
      await tx.escrow.markPaid(v.escrow!, d.chain_deal_id);
    }, "Оплату позначено. Чекаємо підтвердження продавця.");

  const cancel = () =>
    run("Скасування…", async () => {
      if (d.status === "awaiting_deposit") {
        await api(`/api/deals/${d.id}/cancel`, { body: {} });
        return;
      }
      await tx.ensure(d.buyer_wallet);
      await tx.escrow.cancel(v.escrow!, d.chain_deal_id);
    }, "Угоду скасовано");

  return (
    <Card title="Ваші дії (покупець)">
      {busy ? (
        <Busy>{busy}</Busy>
      ) : d.frozen ? (
        <Alert tone="bad" title="Угоду зупинено">
          Не здійснюйте оплату, доки адміністратор не ухвалить рішення.
        </Alert>
      ) : d.status === "awaiting_deposit" ? (
        <Button variant="ghost" onClick={cancel}>
          Скасувати угоду
        </Button>
      ) : d.status === "funded" && !pastDeadline ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-ok/25 bg-ok/5 p-3.5 text-sm space-y-1">
            <div className="text-ok font-medium">USDT заблоковано в ескроу ✓ — можна платити</div>
            <div className="text-ink-2">
              Сума: <b className="text-ink tabular">{fmtUah(d.total_uah)}</b> через {d.payment_method}
            </div>
            <div className="text-ink-2">
              Отримувач: <b className="text-ink">{v.seller.card_holder_name}</b>, картка закінчується на *{v.seller.card_last4}
            </div>
            <div className="text-ink-3 text-xs">Повний номер картки продавець надішле в чаті. Перевірте, що останні 4 цифри та ім&apos;я збігаються.</div>
          </div>
          <Field label="Ім'я відправника (як у вашому банку)" hint="Платіть лише з власної верифікованої картки.">
            <Input value={sender} onChange={(e) => setSender(e.target.value)} autoComplete="name" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={paid} disabled={sender.trim().length < 3}>
              Я оплатив
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Скасувати (USDT повернуться продавцю)
            </Button>
          </div>
        </div>
      ) : d.status === "funded" && pastDeadline ? (
        <Alert tone="bad" title="Час на оплату минув">
          Якщо ви вже переказали гроші — негайно натисніть «Відкрити спір» нижче. Якщо ні — нічого не робіть, угода скасується автоматично.
        </Alert>
      ) : d.status === "paid" ? (
        <p className="text-sm text-ink-2">Продавець перевіряє надходження. Нових дій від вас не потрібно.</p>
      ) : (
        <p className="text-sm text-ink-3">Дій не потрібно.</p>
      )}
    </Card>
  );
}
