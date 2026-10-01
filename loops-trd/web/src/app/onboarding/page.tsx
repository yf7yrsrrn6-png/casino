"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { Guard } from "@/components/shell";
import { useMe, useRefreshMe } from "@/components/session";
import { api, errorText } from "@/lib/api";

export default function OnboardingPage() {
  return (
    <Guard need="auth">
      <Onboarding />
    </Guard>
  );
}

function Onboarding() {
  const me = useMe();
  const p = me.data?.profile;
  // Форма монтується з уже завантаженими даними профілю (key) — без setState в ефекті.
  return <OnboardingForm key={p ? "loaded" : "empty"} />;
}

function OnboardingForm() {
  const me = useMe();
  const refresh = useRefreshMe();
  const router = useRouter();
  const p = me.data?.profile;
  const [f, setF] = useState({
    display_name: p?.display_name ?? "",
    telegram: p?.telegram ?? "",
    card_holder_name: p?.card_holder_name ?? "",
    card_last4: p?.card_last4 ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api("/api/me/profile", { method: "PUT", body: f });
      await refresh();
      router.push("/account");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Профіль учасника" sub="Крок 3 з 4: після заповнення адміністратор перевірить і схвалить заявку." />
      <Card>
        <div className="space-y-4">
          <Field label="Ім'я (як вас знають друзі)">
            <Input value={f.display_name} onChange={set("display_name")} placeholder="Олена" maxLength={40} />
          </Field>
          <Field label="Telegram" hint="Для зв'язку щодо угод.">
            <Input value={f.telegram} onChange={set("telegram")} placeholder="@nickname" />
          </Field>
          <Field label="Ім'я власника картки" hint="Як у банку. З цим іменем звіряється відправник оплати.">
            <Input value={f.card_holder_name} onChange={set("card_holder_name")} placeholder="Олена Шевченко" disabled={!!p?.profile_completed} />
          </Field>
          <Field label="Останні 4 цифри картки" hint="Лише 4 цифри. Повний номер ніколи не зберігається.">
            <Input
              value={f.card_last4}
              onChange={(e) => setF({ ...f, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              inputMode="numeric"
              placeholder="1234"
              disabled={!!p?.profile_completed}
            />
          </Field>
          {p?.profile_completed && <Alert>Картку після подання заявки можна змінити лише через запит у кабінеті (з повторним схваленням).</Alert>}
          <Alert tone="info">Жодних документів, фото, повних номерів карток, приватних ключів чи seed-фраз ми не просимо.</Alert>
          {err && <Alert tone="bad">{err}</Alert>}
          <Button className="w-full" size="lg" onClick={save} loading={busy}>
            Надіслати на перевірку
          </Button>
        </div>
      </Card>
    </div>
  );
}
