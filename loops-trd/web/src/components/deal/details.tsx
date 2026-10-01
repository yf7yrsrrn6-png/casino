import { Badge, Card, KV } from "../ui";
import { EVENT_LABEL, fmtDate, fmtNum, fmtUah, fmtUsdt, shortAddr } from "@/lib/format";
import type { DealView, Party } from "./types";

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

export function DealDetails({ v }: { v: DealView }) {
  const d = v.deal;
  return (
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
  );
}

export function DisputeCard({ v }: { v: DealView }) {
  if (!v.dispute) return null;
  const s = v.dispute;
  return (
    <Card title="Спір">
      <KV k="Статус" v={<Badge tone={s.status === "resolved" ? "ok" : "bad"}>{s.status === "resolved" ? "Вирішено" : s.status === "recommended" ? "Є рекомендація" : "Відкрито"}</Badge>} />
      <KV k="Причина" v={s.reason} />
      {s.recommendation && <KV k="Рекомендація модератора" v={`${s.recommendation} (покупцю: ${fmtNum(s.recommended_to_buyer)} USDT)`} />}
      {s.resolution_note && <KV k="Рішення адміністратора" v={`${s.resolution_note} (покупцю: ${fmtNum(s.resolution_to_buyer)} USDT)`} />}
    </Card>
  );
}

export function DealJournal({ v }: { v: DealView }) {
  return (
    <Card title="Журнал дій">
      <ol className="space-y-2.5">
        {v.events.map((e) => (
          <li key={e.id} className="flex gap-3 text-[13px]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-ink">{EVENT_LABEL[e.action] ?? e.action}</div>
              <div className="text-[11.5px] text-ink-3 font-mono break-all">
                {fmtDate(e.created_at)} · {e.actor_wallet === "system" ? "система" : shortAddr(e.actor_wallet)}
                {e.tx_hash && (
                  <>
                    {" · "}
                    <a className="text-brand-2 hover:underline" href={`https://testnet.bscscan.com/tx/${e.tx_hash}`} target="_blank" rel="noreferrer noopener">
                      транзакція
                    </a>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const STEPS = ["Депозит USDT", "Оплата гривнею", "Підтвердження", "Завершено"];
const stepOf = (s: string) => ({ awaiting_deposit: 0, funded: 1, paid: 2, disputed: 2, released: 4, resolved: 4 })[s] ?? -1;

export function DealProgress({ status }: { status: string }) {
  const step = stepOf(status);
  if (step < 0) return null;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Етапи угоди">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0" aria-current={i === step ? "step" : undefined}>
          <div className={`h-1.5 rounded-full ${i < step || step === 4 ? "brand-gradient" : i === step ? "bg-brand/50" : "bg-surface-3"}`} />
          <div className={`mt-1.5 text-[11px] sm:text-xs truncate ${i <= step ? "text-ink-2" : "text-ink-3"}`}>{s}</div>
        </li>
      ))}
    </ol>
  );
}
