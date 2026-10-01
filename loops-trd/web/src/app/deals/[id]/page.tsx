"use client";

import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { parseUnits, type Address, type Hex } from "viem";
import { Alert, Badge, Button, Card, Countdown, Field, Input, KV, Modal, PageTitle, Spinner, Textarea, cx, useToast } from "@/components/ui";
import { Guard } from "@/components/shell";
import { DealChat } from "@/components/chat";
import { useEscrowTx } from "@/components/use-escrow";
import { isAdminRole, useMe, useSignAction } from "@/components/session";
import { api, errorText } from "@/lib/api";
import { escrowAbi, mockUsdtAbi } from "@/lib/abi";
import { DEAL_STATUS, EVENT_LABEL, RISK, fmtDate, fmtNum, fmtUah, fmtUsdt, shortAddr } from "@/lib/format";

interface Party {
  id: string;
  display_name: string;
  telegram: string;
  successful_deals: number;
  disputes_lost: number;
  card_holder_name?: string;
  card_last4?: string;
}
interface Deal {
  id: string;
  chain_deal_id: Hex;
  seller_id: string;
  buyer_id: string;
  seller_wallet: string;
  buyer_wallet: string;
  amount_usdt: string;
  price_uah: string;
  total_uah: string;
  payment_method: string;
  status: keyof typeof DEAL_STATUS;
  frozen: boolean;
  release_approved: boolean;
  risk_level: "low" | "medium" | "high" | null;
  risk_score: number | null;
  release_check: string | null;
  release_check_done: boolean;
  buyer_sender_name: string | null;
  sender_name_mismatch: boolean;
  payment_deadline: string | null;
  created_at: string;
}
interface Signal {
  code: string;
  party: string;
  layer: number;
  weight: number;
  label: string;
  explanation: string;
}
interface View {
  deal: Deal;
  role: "buyer" | "seller" | "staff";
  seller: Party;
  buyer: Party;
  events: { id: number; action: string; actor_wallet: string; details: Record<string, unknown>; tx_hash: string | null; created_at: string }[];
  dispute: null | {
    status: string;
    reason: string;
    opened_by: string;
    recommendation: string | null;
    recommended_to_buyer: string | null;
    resolution_to_buyer: string | null;
    resolution_note: string | null;
    fraud_label: string | null;
  };
  risks: { id: string; stage: string; score: number; level: string; decision: string; signals: Signal[]; created_at: string }[];
  escrow: Address | null;
  usdt: Address | null;
}

export default function DealPage() {
  return (
    <Guard>
      <DealView />
    </Guard>
  );
}

const STEPS = ["Депозит USDT", "Оплата гривнею", "Підтвердження", "Завершено"];
function stepOf(s: string) {
  return { awaiting_deposit: 0, funded: 1, paid: 2, disputed: 2, released: 4, resolved: 4, cancelled: -1, blocked: -1 }[s] ?? 0;
}

function DealView() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["deal", id], queryFn: () => api<View>(`/api/deals/${id}`), refetchInterval: 8000 });
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
      <div className="py-20 flex justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (q.error || !q.data) return <Alert tone="bad">{errorText(q.error) || "Угоду не знайдено"}</Alert>;

  const v = q.data;
  const d = v.deal;
  const st = DEAL_STATUS[d.status];
  const step = stepOf(d.status);
  const closed = ["released", "cancelled", "resolved", "blocked"].includes(d.status);
  const actor = me.data!.actor!;
  const title = v.role === "buyer" ? `Купівля ${fmtNum(d.amount_usdt)} USDT` : v.role === "seller" ? `Продаж ${fmtNum(d.amount_usdt)} USDT` : `Угода ${fmtNum(d.amount_usdt)} USDT`;

  return (
    <div>
      <PageTitle
        title={title}
        sub={`${fmtUah(d.total_uah)} · ${fmtUah(d.price_uah)} за 1 USDT · ${d.payment_method}`}
        actions={
          <div className="flex items-center gap-2">
            {d.frozen && <Badge tone="bad">Заморожено</Badge>}
            {d.risk_level && d.risk_level !== "low" && (v.role === "staff" || d.risk_level === "medium") && <Badge tone={RISK[d.risk_level].tone}>{RISK[d.risk_level].label}</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
            <Button size="sm" variant="ghost" onClick={() => refresh()} loading={syncing} title="Оновити стан з блокчейну">
              ⟳
            </Button>
          </div>
        }
      />

      {step >= 0 && (
        <ol className="mb-5 grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cx("h-1.5 rounded-full", i < step || step === 4 ? "brand-gradient" : i === step ? "bg-brand/50" : "bg-surface-3")} />
              <div className={cx("mt-1.5 text-[11px] sm:text-xs truncate", i <= step ? "text-ink-2" : "text-ink-3")}>{s}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4 min-w-0">
          <Alert tone="warn" title="Підтверджуйте лише після надходження коштів у банк, не за скріншотом">
            Перевірте зарахування у застосунку свого банку. Відправник має збігатися з верифікованим ім&apos;ям покупця.
          </Alert>

          {v.role === "seller" && <SellerActions v={v} refresh={refresh} toast={toast} />}
          {v.role === "buyer" && <BuyerActions v={v} refresh={refresh} toast={toast} />}
          {(v.role === "buyer" || v.role === "seller") && !closed && <DisputeAction v={v} refresh={refresh} toast={toast} />}
          {v.role === "staff" && <StaffPanel v={v} refresh={refresh} toast={toast} isAdmin={isAdminRole(actor)} />}

          <Card title="Деталі">
            <KV k="Сума" v={fmtUsdt(d.amount_usdt)} />
            <KV k="До сплати" v={fmtUah(d.total_uah)} />
            <KV k="Спосіб оплати" v={d.payment_method} />
            <KV k="Продавець" v={<PartyLine p={v.seller} />} />
            <KV k="Покупець" v={<PartyLine p={v.buyer} />} />
            {v.seller.card_holder_name && <KV k="Картка продавця" v={`${v.seller.card_holder_name} · *${v.seller.card_last4}`} />}
            {v.buyer.card_holder_name && <KV k="Верифікований платник" v={`${v.buyer.card_holder_name} · *${v.buyer.card_last4}`} />}
            {d.buyer_sender_name && <KV k="Ім'я відправника (зі слів покупця)" v={d.buyer_sender_name} />}
            {d.sender_name_mismatch && <KV k="Звірка імені" v={<Badge tone="bad">не збігається</Badge>} />}
            <KV k="Створено" v={fmtDate(d.created_at)} />
            <KV k="ID у контракті" v={shortAddr(d.chain_deal_id)} mono />
          </Card>

          {v.dispute && (
            <Card title="Спір">
              <KV k="Статус" v={<Badge tone={v.dispute.status === "resolved" ? "ok" : "bad"}>{v.dispute.status === "resolved" ? "Вирішено" : v.dispute.status === "recommended" ? "Є рекомендація" : "Відкрито"}</Badge>} />
              <KV k="Причина" v={v.dispute.reason} />
              {v.dispute.recommendation && <KV k="Рекомендація модератора" v={`${v.dispute.recommendation} (покупцю: ${fmtNum(v.dispute.recommended_to_buyer)} USDT)`} />}
              {v.dispute.resolution_note && <KV k="Рішення адміністратора" v={`${v.dispute.resolution_note} (покупцю: ${fmtNum(v.dispute.resolution_to_buyer)} USDT)`} />}
            </Card>
          )}

          <Card title="Журнал дій">
            <ol className="space-y-2.5">
              {v.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-[13px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink">{EVENT_LABEL[e.action] ?? e.action}</div>
                    <div className="text-[11.5px] text-ink-3 font-mono break-all">
                      {fmtDate(e.created_at)} · {e.actor_wallet === "system" ? "система" : shortAddr(e.actor_wallet)}
                      {e.tx_hash && (
                        <>
                          {" · "}
                          <a className="text-brand-2 hover:underline" href={`https://testnet.bscscan.com/tx/${e.tx_hash}`} target="_blank" rel="noreferrer">
                            tx
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 self-start">
          <DealChat dealId={d.id} myId={actor.id} closed={closed} />
        </div>
      </div>
      {toast.node}
    </div>
  );
}

function PartyLine({ p }: { p: Party }) {
  return (
    <span>
      {p.display_name} <span className="text-ink-3">{p.telegram}</span>
      <span className="block text-[11.5px] text-ink-3">
        {p.successful_deals} угод{p.disputes_lost ? ` · програно спорів: ${p.disputes_lost}` : ""}
      </span>
    </span>
  );
}

type Toast = ReturnType<typeof useToast>;
interface ActionProps {
  v: View;
  refresh: (sync?: boolean) => Promise<void>;
  toast: Toast;
}

function Busy({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-sm text-ink-2"><Spinner size={14} /> {children}</div>;
}

// ─── Продавець ───────────────────────────────────────────────────────────

function SellerActions({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState<string | null>(null);
  const [received, setReceived] = useState(false);
  const [nameOk, setNameOk] = useState<boolean | null>(null);
  const [waitStaff, setWaitStaff] = useState(false);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const deposit = () =>
    run("Депозит…", async () => {
      await tx.ensure(d.seller_wallet);
      const sig = await api<{ chainDealId: Hex; buyer: Address; amount: string; reviewRequired: boolean; expiry: number; signature: Hex; escrow: Address; usdt: Address }>(
        `/api/deals/${d.id}/signature`,
      );
      const onchain = await tx.read<{ status: number }>({ address: sig.escrow, abi: escrowAbi, functionName: "getDeal", args: [sig.chainDealId] });
      if (onchain.status === 0) {
        setBusy("1/3 Реєстрація угоди в контракті…");
        await tx.write({ address: sig.escrow, abi: escrowAbi, functionName: "createDeal", args: [sig.chainDealId, sig.buyer, BigInt(sig.amount), sig.reviewRequired, BigInt(sig.expiry), sig.signature] });
      }
      const allowance = await tx.read<bigint>({ address: sig.usdt, abi: mockUsdtAbi, functionName: "allowance", args: [tx.address!, sig.escrow] });
      if (allowance < BigInt(sig.amount)) {
        setBusy("2/3 Дозвіл на списання USDT…");
        await tx.write({ address: sig.usdt, abi: mockUsdtAbi, functionName: "approve", args: [sig.escrow, BigInt(sig.amount)] });
      }
      setBusy("3/3 Внесення USDT в ескроу…");
      await tx.write({ address: sig.escrow, abi: escrowAbi, functionName: "deposit", args: [sig.chainDealId] });
      toast.ok("USDT внесено в ескроу");
    });

  const release = () =>
    run("Перевірка антифродом…", async () => {
      await tx.ensure(d.seller_wallet);
      let r = await api<{ status: string; nonce?: string; message?: string }>(`/api/deals/${d.id}/release`, {
        body: { senderNameMatches: nameOk === true, receivedInBank: true },
      });
      if (r.status === "needs_signature") {
        setBusy("Додаткове підтвердження підписом гаманця…");
        const signature = await signMessageAsync({ message: r.message! });
        r = await api(`/api/deals/${d.id}/release-signature`, { body: { nonce: r.nonce, signature } });
      }
      if (r.status === "needs_staff") {
        setWaitStaff(true);
        toast.ok("Угоду передано на перевірку модератору");
        return;
      }
      if (r.status === "frozen") {
        toast.bad("Угоду зупинено системою безпеки до рішення адміністратора");
        return;
      }
      setBusy("Відпуск USDT покупцю…");
      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "confirmRelease", args: [d.chain_deal_id] });
      toast.ok("USDT відправлено покупцю");
    });

  const cancel = () =>
    run("Скасування…", async () => {
      await api(`/api/deals/${d.id}/cancel`, { body: {} });
    });

  const expiredUnpaid = d.status === "funded" && d.payment_deadline && new Date(d.payment_deadline) < new Date();
  const cancelExpired = () =>
    run("Повернення USDT…", async () => {
      await tx.ensure(d.seller_wallet);
      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "cancel", args: [d.chain_deal_id] });
    });

  return (
    <Card title="Ваші дії (продавець)">
      {busy ? (
        <Busy>{busy}</Busy>
      ) : d.frozen ? (
        <Alert tone="bad" title="Угоду зупинено системою безпеки">Кошти залишаються в ескроу до рішення адміністратора. Відпустити або повернути їх зараз неможливо.</Alert>
      ) : d.status === "awaiting_deposit" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Внесіть <b>{fmtUsdt(d.amount_usdt)}</b> в ескроу-контракт. Будуть 2–3 підтвердження в гаманці.
            {d.payment_deadline && (
              <>
                {" "}
                Залишилось: <Countdown to={d.payment_deadline} />
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={deposit}>Внести USDT в ескроу</Button>
            <Button variant="ghost" onClick={cancel}>
              Скасувати угоду
            </Button>
          </div>
        </div>
      ) : d.status === "funded" || d.status === "paid" ? (
        <div className="space-y-3">
          {d.status === "funded" && (
            <p className="text-sm text-ink-2">
              Очікуємо оплату від покупця{d.payment_deadline && <> · <Countdown to={d.payment_deadline} /></>}. Не відпускайте USDT, доки гроші не надійдуть у ваш банк.
            </p>
          )}
          {d.status === "paid" && <Alert tone="info" title="Покупець позначив оплату">Відкрийте банківський застосунок і перевірте зарахування {fmtUah(d.total_uah)}.</Alert>}
          {(waitStaff || (d.release_check === "staff" && !d.release_check_done)) && (
            <Alert tone="warn">Потрібна перевірка модератором перед відпуском коштів. Ви отримаєте сповіщення.</Alert>
          )}
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#8b6cff]" checked={received} onChange={(e) => setReceived(e.target.checked)} />
            <span>Я бачу зарахування {fmtUah(d.total_uah)} у застосунку свого банку (не скріншот)</span>
          </label>
          <div className="text-sm">
            <div className="text-ink-3 mb-1.5">
              Відправник у банку — <b className="text-ink">{v.buyer.card_holder_name ?? "покупець"}</b>?
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={nameOk === true ? "ok" : "secondary"} onClick={() => setNameOk(true)}>
                Так, збігається
              </Button>
              <Button size="sm" variant={nameOk === false ? "danger" : "secondary"} onClick={() => setNameOk(false)}>
                Ні, інше ім&apos;я
              </Button>
            </div>
          </div>
          <Button variant="ok" disabled={!received || nameOk === null} onClick={release}>
            Підтвердити отримання та відпустити USDT
          </Button>
          {expiredUnpaid && (
            <Button variant="ghost" onClick={cancelExpired}>
              Час оплати минув — повернути USDT собі
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Дій не потрібно.</p>
      )}
    </Card>
  );
}

// ─── Покупець ────────────────────────────────────────────────────────────

function BuyerActions({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const [busy, setBusy] = useState<string | null>(null);
  const [sender, setSender] = useState(v.buyer.card_holder_name ?? "");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const paid = () =>
    run("Позначаємо оплату…", async () => {
      await tx.ensure(d.buyer_wallet);
      const r = await api<{ mismatch: boolean }>(`/api/deals/${d.id}/paid-intent`, { body: { senderName: sender } });
      if (r.mismatch) toast.bad("Ім'я відправника не збігається з верифікованим — угоду може бути зупинено для перевірки");
      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "markPaid", args: [d.chain_deal_id] });
      toast.ok("Оплату позначено. Очікуйте підтвердження продавця.");
    });

  const cancel = () =>
    run("Скасування…", async () => {
      if (d.status === "awaiting_deposit") {
        await api(`/api/deals/${d.id}/cancel`, { body: {} });
        return;
      }
      await tx.ensure(d.buyer_wallet);
      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "cancel", args: [d.chain_deal_id] });
    });

  return (
    <Card title="Ваші дії (покупець)">
      {busy ? (
        <Busy>{busy}</Busy>
      ) : d.frozen ? (
        <Alert tone="bad" title="Угоду зупинено системою безпеки">Не здійснюйте оплату, доки адміністратор не ухвалить рішення.</Alert>
      ) : d.status === "awaiting_deposit" ? (
        <div className="space-y-3">
          <Alert tone="warn" title="Ще не платіть">Продавець має спершу внести USDT в ескроу. Ви отримаєте сповіщення.</Alert>
          <Button variant="ghost" onClick={cancel}>
            Скасувати угоду
          </Button>
        </div>
      ) : d.status === "funded" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-ok/25 bg-ok/5 p-3.5 text-sm space-y-1">
            <div className="text-ok font-medium">USDT заблоковано в ескроу ✓</div>
            <div className="text-ink-2">
              Переказати: <b className="text-ink tabular">{fmtUah(d.total_uah)}</b> через {d.payment_method}
            </div>
            <div className="text-ink-2">
              Отримувач: <b className="text-ink">{v.seller.card_holder_name}</b>, картка *{v.seller.card_last4}
            </div>
            <div className="text-ink-3 text-xs">Повний номер картки продавець надішле в чаті. Звірте останні 4 цифри та ім&apos;я.</div>
            {d.payment_deadline && (
              <div className="text-ink-2">
                Залишилось часу: <Countdown to={d.payment_deadline} />
              </div>
            )}
          </div>
          <Field label="Ім'я відправника (як у вашому банку)" hint="Платіть лише з власної верифікованої картки.">
            <Input value={sender} onChange={(e) => setSender(e.target.value)} />
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
      ) : d.status === "paid" ? (
        <Alert tone="info" title="Оплату позначено">Продавець перевіряє надходження. Якщо підтвердження немає довго — напишіть у чат або відкрийте спір.</Alert>
      ) : (
        <p className="text-sm text-ink-3">Дій не потрібно.</p>
      )}
    </Card>
  );
}

// ─── Спір ────────────────────────────────────────────────────────────────

function DisputeAction({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!["funded", "paid"].includes(d.status)) return null;
  const wallet = v.role === "buyer" ? d.buyer_wallet : d.seller_wallet;

  const submit = async () => {
    setBusy(true);
    try {
      await tx.ensure(wallet);
      await api(`/api/deals/${d.id}/dispute`, { body: { reason } });
      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "openDispute", args: [d.chain_deal_id] });
      setOpen(false);
      toast.ok("Спір відкрито. Модератор зв'яжеться в чаті.");
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Відкрити спір
        </Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Відкрити спір">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Кошти залишаться в ескроу. Модератор розгляне ситуацію й дасть рекомендацію, остаточне рішення — за адміністратором.</p>
          <Field label="Що сталося?">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Опишіть ситуацію, додайте деталі в чат" />
          </Field>
          <Button variant="danger" className="w-full" loading={busy} disabled={reason.trim().length < 5} onClick={submit}>
            Відкрити спір
          </Button>
        </div>
      </Modal>
    </>
  );
}

// ─── Персонал ────────────────────────────────────────────────────────────

function StaffPanel({ v, refresh, toast, isAdmin }: ActionProps & { isAdmin: boolean }) {
  const d = v.deal;
  const tx = useEscrowTx();
  const signAction = useSignAction();
  const me = useMe();
  const [rec, setRec] = useState({ recommendation: "", toBuyer: d.amount_usdt });
  const [res, setRes] = useState({ toBuyer: v.dispute?.recommended_to_buyer ?? d.amount_usdt, note: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      toast.ok("Готово");
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(null);
      await refresh();
    }
  };
  const disputeOpen = v.dispute && v.dispute.status !== "resolved";
  const canResolveOnChain = d.status === "disputed" || (d.frozen && (d.status === "funded" || d.status === "paid"));

  return (
    <div className="space-y-4">
      <Card title="Сигнали ризику" actions={d.risk_level && <Badge tone={RISK[d.risk_level].tone}>{RISK[d.risk_level].label} · {d.risk_score ?? 0}</Badge>}>
        {v.risks.length === 0 ? (
          <p className="text-sm text-ink-3">Оцінок немає.</p>
        ) : (
          <div className="space-y-4">
            {v.risks.map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <span>{{ create: "Створення", paid: "Після оплати", release: "Перед відпуском" }[r.stage] ?? r.stage}</span>·<span>{fmtDate(r.created_at)}</span>·
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

      {busy && (
        <Card>
          <Busy>{busy}</Busy>
        </Card>
      )}

      {d.release_check === "staff" && !d.release_check_done && !d.frozen && ["funded", "paid"].includes(d.status) && (
        <Card title="Перевірка перед відпуском">
          <p className="mb-3 text-sm text-ink-2">Середній ризик: потрібне підтвердження персоналу. Кошти все одно відпускає лише продавець.</p>
          <Field label="Коментар">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Що перевірено" />
          </Field>
          <Button className="mt-3" variant="ok" disabled={note.length < 3} onClick={() => run("Схвалення…", () => api(`/api/mod/deals/${d.id}/approve-review`, { body: { note } }))}>
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
            <Button variant="secondary" disabled={rec.recommendation.length < 5} onClick={() => run("Збереження…", () => api(`/api/mod/deals/${d.id}/recommend`, { body: rec }))}>
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
                disabled={res.note.length < 3}
                onClick={() =>
                  run("Транзакція resolveDispute…", async () => {
                    await tx.ensure(me.data?.actor?.wallet_address);
                    const hash = await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "resolveDispute", args: [d.chain_deal_id, parseUnits(String(res.toBuyer), 18)] });
                    await api(`/api/admin/deals/${d.id}/resolve`, { body: { txHash: hash, note: res.note } });
                  })
                }
              >
                Виконати рішення
              </Button>
              {d.frozen && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    run("Розморожування…", async () => {
                      await tx.ensure(me.data?.actor?.wallet_address);
                      await tx.write({ address: v.escrow!, abi: escrowAbi, functionName: "unfreezeDeal", args: [d.chain_deal_id] });
                    })
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
          <div className="mt-3 flex gap-2">
            {(["allow", "cancel"] as const).map((decision) => (
              <Button
                key={decision}
                variant={decision === "allow" ? "ok" : "danger"}
                disabled={note.length < 3}
                onClick={() =>
                  run("Підпис…", async () => {
                    const input = { decision, note };
                    const signed = await signAction("deal.frozen_decision", { dealId: d.id, ...input });
                    await api(`/api/admin/deals/${d.id}/frozen`, { body: { input, signed } });
                  })
                }
              >
                {decision === "allow" ? "Дозволити (з перевіркою перед відпуском)" : "Скасувати угоду"}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && v.dispute?.status === "resolved" && (
        <Card title="Зворотний зв'язок для антифроду" actions={v.dispute.fraud_label && <Badge tone={v.dispute.fraud_label === "fraud" ? "bad" : "ok"}>{v.dispute.fraud_label === "fraud" ? "шахрайство" : "чесна угода"}</Badge>}>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={() => run("…", () => api(`/api/admin/deals/${d.id}/label`, { body: { label: "fraud" } }))}>
              Шахрайство
            </Button>
            <Button variant="ok" size="sm" onClick={() => run("…", () => api(`/api/admin/deals/${d.id}/label`, { body: { label: "honest" } }))}>
              Чесна угода
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
