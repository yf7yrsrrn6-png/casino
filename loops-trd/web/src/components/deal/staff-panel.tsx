"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { Badge, Button, Card, Field, Input, Textarea, cx } from "../ui";
import { useEscrowTx } from "../use-escrow";
import { useMe, useSignAction } from "../session";
import { api } from "@/lib/api";
import { RISK, fmtDate, fmtNum } from "@/lib/format";
import { Busy } from "./busy";
import type { ActionProps } from "./types";
import { useDealAction } from "./use-action";

const STAGE: Record<string, string> = { create: "Створення", paid: "Після оплати", release: "Перед відпуском" };

export function RiskSignals({ v }: Pick<ActionProps, "v">) {
  const d = v.deal;
  return (
    <Card title="Сигнали ризику" actions={d.risk_level && <Badge tone={RISK[d.risk_level].tone}>{RISK[d.risk_level].label} · {d.risk_score ?? 0}</Badge>}>
      {v.risks.length === 0 ? (
        <p className="text-sm text-ink-3">Оцінок немає.</p>
      ) : (
        <div className="space-y-4">
          {v.risks.map((r) => (
            <div key={r.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <span>{STAGE[r.stage] ?? r.stage}</span>·<span>{fmtDate(r.created_at)}</span>·
                <Badge tone={RISK[r.level]?.tone}>
                  {r.score} балів · {r.decision}
                </Badge>
              </div>
              <ul className="mt-2 space-y-1.5">
                {r.signals.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[13px]">
                    <span className={cx("shrink-0 w-10 text-right tabular font-mono", s.layer === 1 ? "text-bad" : s.layer === 3 ? "text-warn" : "text-ink-3")}>
                      {s.layer === 1 ? "⛔" : s.layer === 3 ? "⚠" : `+${s.weight}`}
                    </span>
                    <span>
                      <b className="font-medium">{s.label}.</b> <span className="text-ink-2">{s.explanation}</span>
                    </span>
                  </li>
                ))}
                {r.signals.length === 0 && <li className="text-[13px] text-ink-3">Жодного сигналу.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function StaffPanel({ v, refresh, toast, isAdmin }: ActionProps & { isAdmin: boolean }) {
  const d = v.deal;
  const tx = useEscrowTx();
  const signAction = useSignAction();
  const me = useMe();
  const { busy, run } = useDealAction({ refresh, toast });
  const [rec, setRec] = useState({ recommendation: "", toBuyer: d.amount_usdt });
  const [res, setRes] = useState({ toBuyer: v.dispute?.recommended_to_buyer ?? d.amount_usdt, note: "" });
  const [note, setNote] = useState("");
  const myWallet = me.data?.actor?.wallet_address;
  const disputeOpen = v.dispute && v.dispute.status !== "resolved";
  const canResolveOnChain = d.status === "disputed" || (d.frozen && (d.status === "funded" || d.status === "paid"));

  return (
    <div className="space-y-4">
      <RiskSignals v={v} />
      {busy && (
        <Card>
          <Busy>{busy}</Busy>
        </Card>
      )}

      {d.release_check === "staff" && !d.release_check_done && !d.frozen && ["funded", "paid"].includes(d.status) && (
        <Card title="Перевірка перед відпуском">
          <p className="mb-3 text-sm text-ink-2">
            Потрібне підтвердження персоналу{d.sender_name_mismatch ? " (ім'я відправника не збігається з верифікованим)" : ""}. Кошти все одно відпускає лише продавець.
          </p>
          <Field label="Що перевірено">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: покупець надіслав виписку, переказ з його картки" />
          </Field>
          <Button className="mt-3" variant="ok" disabled={note.trim().length < 3} onClick={() => run("Схвалення…", () => api(`/api/mod/deals/${d.id}/approve-review`, { body: { note } }), "Перевірку схвалено")}>
            Схвалити перевірку
          </Button>
        </Card>
      )}

      {disputeOpen && (
        <Card title="Рекомендація адміністратору">
          <div className="space-y-3">
            <Field label="Обґрунтування">
              <Textarea value={rec.recommendation} onChange={(e) => setRec({ ...rec, recommendation: e.target.value })} />
            </Field>
            <Field label={`Покупцю, USDT (з ${fmtNum(d.amount_usdt)})`}>
              <Input inputMode="decimal" value={rec.toBuyer} onChange={(e) => setRec({ ...rec, toBuyer: e.target.value })} />
            </Field>
            <Button variant="secondary" disabled={rec.recommendation.trim().length < 5} onClick={() => run("Збереження…", () => api(`/api/mod/deals/${d.id}/recommend`, { body: rec }), "Рекомендацію надіслано")}>
              Надіслати рекомендацію
            </Button>
          </div>
        </Card>
      )}

      {isAdmin && canResolveOnChain && (
        <Card title="Остаточне рішення (адміністратор)">
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Виконується транзакцією resolveDispute з вашого гаманця (роль ARBITER). Решта суми повернеться продавцю.</p>
            <Field label={`Покупцю, USDT (з ${fmtNum(d.amount_usdt)})`}>
              <Input inputMode="decimal" value={res.toBuyer} onChange={(e) => setRes({ ...res, toBuyer: e.target.value })} />
            </Field>
            <Field label="Обґрунтування рішення">
              <Textarea value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={res.note.trim().length < 3}
                onClick={() =>
                  run("Транзакція resolveDispute…", async () => {
                    await tx.ensure(myWallet);
                    const hash = await tx.escrow.resolveDispute(v.escrow!, d.chain_deal_id, parseUnits(String(res.toBuyer), 18));
                    await api(`/api/admin/deals/${d.id}/resolve`, { body: { txHash: hash, note: res.note } });
                  }, "Рішення виконано")
                }
              >
                Виконати рішення
              </Button>
              {d.frozen && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    run("Розморожування…", async () => {
                      await tx.ensure(myWallet);
                      await tx.escrow.unfreezeDeal(v.escrow!, d.chain_deal_id);
                    }, "Угоду розморожено")
                  }
                >
                  Розморозити (угода продовжиться)
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {isAdmin && d.frozen && d.status === "awaiting_deposit" && (
        <Card title="Заморожено до депозиту">
          <p className="mb-3 text-sm text-ink-2">Коштів у контракті ще немає. Рішення підтверджується підписом гаманця.</p>
          <Field label="Коментар">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["allow", "cancel"] as const).map((decision) => (
              <Button
                key={decision}
                variant={decision === "allow" ? "ok" : "danger"}
                disabled={note.trim().length < 3}
                onClick={() =>
                  run("Підпис…", async () => {
                    const input = { decision, note: note.trim() };
                    const signed = await signAction("deal.frozen_decision", { dealId: d.id, ...input });
                    await api(`/api/admin/deals/${d.id}/frozen`, { body: { input, signed } });
                  }, "Рішення збережено")
                }
              >
                {decision === "allow" ? "Дозволити (з перевіркою перед відпуском)" : "Скасувати угоду"}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && v.dispute?.status === "resolved" && (
        <Card
          title="Зворотний зв'язок для антифроду"
          actions={v.dispute.fraud_label && <Badge tone={v.dispute.fraud_label === "fraud" ? "bad" : "ok"}>{v.dispute.fraud_label === "fraud" ? "шахрайство" : "чесна угода"}</Badge>}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={() => run("…", () => api(`/api/admin/deals/${d.id}/label`, { body: { label: "fraud" } }), "Позначено")}>
              Шахрайство
            </Button>
            <Button variant="ok" size="sm" onClick={() => run("…", () => api(`/api/admin/deals/${d.id}/label`, { body: { label: "honest" } }), "Позначено")}>
              Чесна угода
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
