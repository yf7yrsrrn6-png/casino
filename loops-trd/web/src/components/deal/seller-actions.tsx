"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import type { Address, Hex } from "viem";
import { Alert, Button, Card, useNow } from "../ui";
import { useEscrowTx } from "../use-escrow";
import { api } from "@/lib/api";
import { fmtUah, fmtUsdt } from "@/lib/format";
import { Busy } from "./busy";
import { graceEnd, type ActionProps } from "./types";
import { useDealAction } from "./use-action";

interface Signature {
  chainDealId: Hex;
  buyer: Address;
  amount: string;
  reviewRequired: boolean;
  expiry: number;
  signature: Hex;
  escrow: Address;
  usdt: Address;
}

export function SellerActions({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const { signMessageAsync } = useSignMessage();
  const { busy, run } = useDealAction({ refresh, toast });
  const [received, setReceived] = useState(false);
  const [nameOk, setNameOk] = useState<boolean | null>(null);
  const [waitStaff, setWaitStaff] = useState(false);

  const deposit = () =>
    run(
      "Отримуємо дозвіл сервера…",
      async (step) => {
        await tx.ensure(d.seller_wallet);
        const sig = await api<Signature>(`/api/deals/${d.id}/signature`);
        const amount = BigInt(sig.amount);
        await tx.usdt.requireBalance(sig.usdt, tx.address!, amount);
        if ((await tx.escrow.status(sig.escrow, sig.chainDealId)) === 0) {
          step("Крок 1 з 3: реєстрація угоди в контракті…");
          await tx.escrow.createDeal(sig.escrow, [sig.chainDealId, sig.buyer, amount, sig.reviewRequired, BigInt(sig.expiry), sig.signature]);
        }
        if ((await tx.usdt.allowance(sig.usdt, tx.address!, sig.escrow)) < amount) {
          step("Крок 2 з 3: дозвіл на списання USDT…");
          await tx.usdt.approve(sig.usdt, sig.escrow, amount);
        }
        step("Крок 3 з 3: внесення USDT в ескроу…");
        await tx.escrow.deposit(sig.escrow, sig.chainDealId);
      },
      "USDT внесено в ескроу. Покупець отримав сповіщення.",
    );

  const release = () =>
    run("Перевірка системою безпеки…", async (step) => {
      await tx.ensure(d.seller_wallet);
      let r = await api<{ status: string; nonce?: string; message?: string }>(`/api/deals/${d.id}/release`, {
        body: { senderNameMatches: nameOk === true, receivedInBank: true },
      });
      if (r.status === "needs_signature") {
        step("Додаткове підтвердження підписом гаманця…");
        const signature = await signMessageAsync({ message: r.message! });
        r = await api(`/api/deals/${d.id}/release-signature`, { body: { nonce: r.nonce, signature } });
      }
      if (r.status === "needs_staff") {
        setWaitStaff(true);
        toast.ok("Угоду передано на перевірку модератору. Ви отримаєте сповіщення.");
        return;
      }
      if (r.status === "frozen") {
        toast.bad("Угоду зупинено системою безпеки до рішення адміністратора.");
        return;
      }
      step("Відпуск USDT покупцю…");
      await tx.escrow.confirmRelease(v.escrow!, d.chain_deal_id);
      toast.ok("USDT відправлено покупцю. Угоду завершено!");
    });

  const now = useNow();
  const ge = graceEnd(v);
  const canReclaim = d.status === "funded" && ge !== null && ge.getTime() < now;
  const reviewByStaff = waitStaff || (d.release_check === "staff" && !d.release_check_done);

  return (
    <Card title="Ваші дії (продавець)">
      {busy ? (
        <Busy>{busy}</Busy>
      ) : d.frozen ? (
        <Alert tone="bad" title="Угоду зупинено">
          Кошти залишаються в ескроу до рішення адміністратора. Відпустити або повернути їх зараз неможливо.
        </Alert>
      ) : d.status === "awaiting_deposit" ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={deposit}>Внести {fmtUsdt(d.amount_usdt)} в ескроу</Button>
          <Button variant="ghost" onClick={() => run("Скасування…", () => api(`/api/deals/${d.id}/cancel`, { body: {} }), "Угоду скасовано")}>
            Скасувати угоду
          </Button>
        </div>
      ) : d.status === "funded" || d.status === "paid" ? (
        <div className="space-y-4">
          {reviewByStaff && <Alert tone="warn">Перед відпуском коштів угоду перевіряє модератор. Ви отримаєте сповіщення.</Alert>}
          <fieldset className="space-y-3" disabled={reviewByStaff}>
            <label className="flex items-start gap-3 text-sm cursor-pointer min-h-11">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#8b6cff]" checked={received} onChange={(e) => setReceived(e.target.checked)} />
              <span>
                Я бачу зарахування <b>{fmtUah(d.total_uah)}</b> у застосунку свого банку (не скріншот)
              </span>
            </label>
            <div className="text-sm">
              <div className="text-ink-2 mb-2">
                Відправник у банку — <b className="text-ink">{v.buyer.card_holder_name ?? "покупець"}</b>?
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={nameOk === true ? "ok" : "secondary"} onClick={() => setNameOk(true)} aria-pressed={nameOk === true}>
                  Так, збігається
                </Button>
                <Button size="sm" variant={nameOk === false ? "danger" : "secondary"} onClick={() => setNameOk(false)} aria-pressed={nameOk === false}>
                  Ні, інше ім&apos;я
                </Button>
              </div>
              {nameOk === false && (
                <p className="mt-2 text-xs text-warn">
                  Оплата з чужої картки — поширена схема шахрайства. Угоду перевірить модератор; не відпускайте кошти самостійно.
                </p>
              )}
            </div>
            <Button variant="ok" disabled={!received || nameOk === null} onClick={release}>
              Підтвердити отримання та відпустити USDT
            </Button>
          </fieldset>
          {canReclaim && (
            <Button variant="secondary" onClick={() => run("Повернення USDT…", async () => {
              await tx.ensure(d.seller_wallet);
              await tx.escrow.cancel(v.escrow!, d.chain_deal_id);
            }, "USDT повернуто на ваш гаманець")}>
              Покупець не оплатив — повернути USDT собі
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Дій не потрібно.</p>
      )}
    </Card>
  );
}
