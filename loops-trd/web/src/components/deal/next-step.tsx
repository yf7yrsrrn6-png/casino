"use client";

import { useState } from "react";
import { Countdown, cx, useNow } from "../ui";
import { fmtUah, fmtUsdt } from "@/lib/format";
import { graceEnd, type DealView } from "./types";

interface Step {
  tone: "you" | "wait" | "done" | "alert";
  title: string;
  text: string;
  deadline?: { to: Date | string; label: string };
}

/** «Що робити зараз»: одна зрозуміла фраза для поточного стану угоди і ролі. */
export function nextStep(v: DealView, now: number): Step {
  const d = v.deal;
  const ge = graceEnd(v);
  const pastDeadline = d.payment_deadline ? new Date(d.payment_deadline).getTime() < now : false;
  const reviewByStaff = d.release_check === "staff" && !d.release_check_done;

  if (d.status === "released") return { tone: "done", title: "Угоду завершено", text: v.role === "buyer" ? `${fmtUsdt(d.amount_usdt)} уже на вашому гаманці.` : "USDT відправлено покупцю." };
  if (d.status === "cancelled") return { tone: "done", title: "Угоду скасовано", text: "Якщо USDT були в ескроу — вони повернулися продавцю." };
  if (d.status === "resolved") return { tone: "done", title: "Рішення ухвалено", text: "Адміністратор розподілив кошти. Деталі — у блоці «Спір»." };
  if (d.frozen) {
    return {
      tone: "alert",
      title: "Угоду зупинено системою безпеки",
      text: v.role === "buyer" && d.status === "awaiting_deposit" ? "Нічого не платіть. Адміністратор перевірить угоду." : "Кошти в ескроу в безпеці. Нічого не робіть — адміністратор перевірить угоду й зв'яжеться в чаті.",
    };
  }
  if (d.status === "disputed") return { tone: "wait", title: "Спір на розгляді", text: "Додайте в чат докази: час переказу, суму, ім'я відправника. Модератор розгляне, рішення ухвалює адміністратор." };

  if (v.role === "seller") {
    if (d.status === "awaiting_deposit")
      return { tone: "you", title: "Ваш хід: внесіть USDT в ескроу", text: `Заблокуйте ${fmtUsdt(d.amount_usdt)} у контракті — після цього покупець оплатить гривнею.`, deadline: d.payment_deadline ? { to: d.payment_deadline, label: "на депозит" } : undefined };
    if (d.status === "funded") {
      if (pastDeadline && ge && ge.getTime() < now) return { tone: "you", title: "Покупець не оплатив вчасно", text: "Можете повернути USDT собі кнопкою нижче (або це зробить система автоматично)." };
      if (pastDeadline) return { tone: "wait", title: "Час оплати минув", text: "Покупець ще може відкрити спір, якщо вже заплатив. Після цього USDT повернуться вам.", deadline: ge ? { to: ge, label: "до повернення" } : undefined };
      return { tone: "wait", title: "Чекаємо оплату від покупця", text: `Не відпускайте USDT, доки ${fmtUah(d.total_uah)} не з'являться у вашому банку.`, deadline: d.payment_deadline ? { to: d.payment_deadline, label: "на оплату" } : undefined };
    }
    if (d.status === "paid") {
      if (reviewByStaff) return { tone: "wait", title: "Перевірка модератором", text: "Перед відпуском коштів угоду перевіряє модератор. Ви отримаєте сповіщення." };
      return { tone: "you", title: "Ваш хід: перевірте банк", text: `Відкрийте застосунок банку й переконайтеся, що надійшло ${fmtUah(d.total_uah)} від ${v.buyer.card_holder_name ?? "покупця"}. Лише потім підтверджуйте.` };
    }
  }

  if (v.role === "buyer") {
    if (d.status === "awaiting_deposit")
      return { tone: "wait", title: "Ще не платіть", text: "Продавець вносить USDT в ескроу. Ми повідомимо, коли можна оплачувати.", deadline: d.payment_deadline ? { to: d.payment_deadline, label: "продавцю на депозит" } : undefined };
    if (d.status === "funded") {
      if (pastDeadline)
        return { tone: "alert", title: "Час на оплату минув", text: "Якщо ви вже заплатили — НЕГАЙНО відкрийте спір, інакше USDT повернуться продавцю.", deadline: ge ? { to: ge, label: "щоб відкрити спір" } : undefined };
      return { tone: "you", title: "Ваш хід: оплатіть гривнею", text: `Перекажіть ${fmtUah(d.total_uah)} на картку ${v.seller.card_holder_name ?? "продавця"} (*${v.seller.card_last4 ?? "…"}) зі своєї картки, потім натисніть «Я оплатив».`, deadline: d.payment_deadline ? { to: d.payment_deadline, label: "на оплату" } : undefined };
    }
    if (d.status === "paid") return { tone: "wait", title: "Чекаємо продавця", text: "Продавець перевіряє надходження в банку — зазвичай до 15 хв. Якщо довго — напишіть у чат, далі можна відкрити спір." };
  }

  if (reviewByStaff) return { tone: "you", title: "Потрібна перевірка персоналом", text: "Перевірте угоду й схваліть або заморозьте." };
  return { tone: "wait", title: "Угода в процесі", text: "Сторони виконують кроки угоди." };
}

const toneCls = {
  you: "border-brand/40 bg-brand/10",
  wait: "border-line-strong bg-surface-2",
  done: "border-ok/30 bg-ok/5",
  alert: "border-bad/40 bg-bad/10",
};
const toneIcon = { you: "👉", wait: "⏳", done: "✓", alert: "⚠" };

export function NextStep({ v }: { v: DealView }) {
  const now = useNow();
  const s = nextStep(v, now);
  return (
    <div className={cx("rounded-2xl border p-4 sm:p-5", toneCls[s.tone])} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5" aria-hidden>
          {toneIcon[s.tone]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-ink-3 font-semibold">Що робити зараз</div>
          <div className="mt-0.5 text-[16px] font-semibold">{s.title}</div>
          <p className="mt-1 text-sm text-ink-2 leading-relaxed">{s.text}</p>
        </div>
        {s.deadline && (
          <div className="text-right shrink-0">
            <div className="text-xl">
              <Countdown to={s.deadline.to} />
            </div>
            <div className="text-[11px] text-ink-3">{s.deadline.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const GUIDE_KEY = "lt-first-deal-guide-hidden";

/** Покрокова підказка для першої угоди. Можна сховати. */
export function FirstDealGuide({ v }: { v: DealView }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(GUIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (!v.firstDeal || hidden || v.role === "staff") return null;
  const steps =
    v.role === "buyer"
      ? [
          "Дочекайтеся, поки продавець внесе USDT в ескроу — до цього НЕ платіть.",
          `Перекажіть гривню зі своєї картки на картку продавця (ім'я та останні 4 цифри — у блоці «Деталі», повний номер продавець надішле в чаті).`,
          "Натисніть «Я оплатив» і вкажіть ім'я відправника, як у банку. Підтвердіть транзакцію в гаманці.",
          "Продавець перевірить надходження й відпустить USDT — вони прийдуть на ваш гаманець.",
          "Щось не так? Напишіть у чат. Якщо не допомогло — «Відкрити спір»: кошти залишаться в ескроу до рішення адміністратора.",
        ]
      : [
          "Внесіть USDT в ескроу: гаманець попросить 2–3 підтвердження (реєстрація угоди, дозвіл на списання, депозит).",
          "Надішліть покупцю повний номер картки в чаті угоди (після закриття угоди номер замаскується).",
          "Коли покупець натисне «Я оплатив» — відкрийте застосунок БАНКУ і перевірте зарахування та ім'я відправника.",
          "Тільки після цього натисніть «Підтвердити отримання» — контракт відправить USDT покупцю.",
          "Ніколи не підтверджуйте за скріншотом. Сумніви — пишіть у чат або відкривайте спір.",
        ];
  return (
    <div className="rounded-2xl border border-brand-2/30 bg-brand-2/5 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">Ваша перша угода — як це працює</div>
        <button
          className="text-xs text-ink-3 hover:text-ink min-h-10 px-2"
          onClick={() => {
            try {
              localStorage.setItem(GUIDE_KEY, "1");
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
        >
          Сховати
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-ink-2">
            <span className="h-6 w-6 shrink-0 rounded-full bg-surface-3 border border-line-strong flex items-center justify-center text-xs font-semibold text-ink">{i + 1}</span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
