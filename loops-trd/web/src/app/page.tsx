"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, LogoMark } from "@/components/ui";
import { useMe } from "@/components/session";

const features = [
  { t: "Лише за запрошенням", d: "Жодної відкритої реєстрації. Вхід — одноразовий інвайт-код від адміністратора та підпис гаманця (SIWE)." },
  { t: "Ескроу-смарт-контракт", d: "USDT блокуються в контракті до підтвердження оплати. Автоповернення продавцю через 30 хв без оплати." },
  { t: "Антифрод у три шари", d: "Чорні списки й ліміти, сигнали ризику з поясненнями, комбіновані правила. Підозрілі угоди заморожуються." },
  { t: "Спори та арбітраж", d: "Модератор розглядає й рекомендує, остаточне рішення — адміністратор, виконується контрактом." },
];

export default function Home() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    const a = me.data?.actor;
    if (a) router.replace(a.status === "approved" ? "/market" : a.profile_completed ? "/account" : "/onboarding");
  }, [me.data, router]);

  return (
    <div className="py-6 sm:py-14">
      <section className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-2" /> BNB Smart Chain Testnet · тестові кошти
        </div>
        <h1 className="mt-5 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
          Обмін <span className="brand-text">USDT ⇄ UAH</span>
          <br />
          між своїми.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] sm:text-base text-ink-2 leading-relaxed">
          Loops Trd — закрита P2P-площадка для друзів. Кошти продавця тримає ескроу-контракт, гривня йде напряму з картки на картку,
          а антифрод стежить, щоб ніхто не підтвердив угоду «за скріншотом».
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login">
            <Button size="lg">Увійти з гаманцем</Button>
          </Link>
          <a href="#how">
            <Button size="lg" variant="secondary">
              Як це працює
            </Button>
          </a>
        </div>
      </section>

      <section className="mt-14 grid gap-3 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.t} className="rounded-2xl border border-line bg-surface/70 p-5">
            <div className="text-[15px] font-semibold">{f.t}</div>
            <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{f.d}</p>
          </div>
        ))}
      </section>

      <section id="how" className="mt-14">
        <h2 className="text-xl font-semibold">Як проходить угода</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            "Покупець відгукується на оголошення",
            "Продавець вносить USDT в ескроу",
            "Покупець платить гривнею і тисне «Я оплатив»",
            "Продавець бачить кошти в банку і підтверджує",
            "Контракт відправляє USDT покупцю",
          ].map((s, i) => (
            <li key={s} className="rounded-2xl border border-line bg-surface/70 p-4">
              <div className="h-7 w-7 rounded-lg brand-gradient text-[#0b0b12] text-sm font-bold flex items-center justify-center">{i + 1}</div>
              <p className="mt-3 text-sm text-ink-2">{s}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-warn/25 bg-warn/5 p-4 text-sm text-ink-2">
          <LogoMark size={22} />
          Підтверджуйте отримання лише після надходження коштів у банк, не за скріншотом.
        </div>
      </section>
    </div>
  );
}
