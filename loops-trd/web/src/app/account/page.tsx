"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage, useWatchAsset } from "wagmi";
import type { Address } from "viem";
import { Alert, Badge, Button, Card, Field, Input, KV, Modal, PageTitle, useToast } from "@/components/ui";
import { Guard } from "@/components/shell";
import { useMe, useRefreshMe } from "@/components/session";
import { useEscrowTx } from "@/components/use-escrow";
import { api, errorText } from "@/lib/api";
import { ROLE_LABEL, USER_STATUS, fmtDate, fmtNum, shortAddr } from "@/lib/format";

export default function AccountPage() {
  return (
    <Guard need="auth">
      <Account />
    </Guard>
  );
}

function Account() {
  const me = useMe();
  const refresh = useRefreshMe();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const p = me.data!.profile!;
  const actor = me.data!.actor!;
  const st = USER_STATUS[actor.status];
  const limits = me.data!.limits;
  const [edit, setEdit] = useState(false);
  const [card, setCard] = useState(false);
  const [wallet, setWallet] = useState(false);

  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    await qc.invalidateQueries();
    router.push("/");
  };

  return (
    <div>
      <PageTitle title="Кабінет" sub={shortAddr(actor.wallet_address)} actions={<Button variant="ghost" onClick={logout}>Вийти</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Верифікація" actions={<Badge tone={st.tone}>{st.label}</Badge>}>
          {actor.status === "pending" && (
            <Alert tone="warn" title={p.profile_completed ? "Заявка на розгляді" : "Заповніть профіль"}>
              {p.profile_completed ? "Адміністратор перевірить дані та схвалить заявку." : <Link href="/onboarding" className="text-brand">Перейти до профілю →</Link>}
            </Alert>
          )}
          {actor.status === "rejected" && (
            <Alert tone="bad" title="Заявку відхилено">
              {p.status_reason} · <Link href="/onboarding" className="text-brand">Виправити й надіслати знову</Link>
            </Alert>
          )}
          <div className="mt-2">
            <KV k="Роль" v={ROLE_LABEL[actor.role]} />
            <KV k="Гаманець" v={actor.wallet_address} mono />
            <KV k="Учасник з" v={fmtDate(p.created_at)} />
          </div>
        </Card>

        <Card title="Профіль" actions={actor.status === "approved" && <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Редагувати</Button>}>
          <KV k="Ім'я" v={p.display_name ?? "—"} />
          <KV k="Telegram" v={p.telegram ?? "—"} />
          <KV k="Власник картки" v={p.card_holder_name ?? "—"} />
          <KV k="Картка" v={p.card_last4 ? `**** ${p.card_last4}` : "—"} />
          {actor.status === "approved" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setCard(true)}>
                Змінити картку
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setWallet(true)}>
                Змінити гаманець
              </Button>
            </div>
          )}
        </Card>

        {limits && (
          <Card title="Ліміти та рейтинг">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <div className="text-xs text-ink-3">Разовий</div>
                <div className="text-lg font-semibold tabular">{fmtNum(limits.single)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3">На добу</div>
                <div className="text-lg font-semibold tabular">{fmtNum(limits.daily)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3">Рейтинг</div>
                <div className="text-lg font-semibold tabular">{me.data?.rating != null ? `${me.data.rating}%` : "—"}</div>
              </div>
            </div>
            <div className="text-xs text-ink-3 mb-1.5">
              Використано за 24 год: {fmtNum(limits.usedToday)} / {fmtNum(limits.daily)} USDT
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full brand-gradient" style={{ width: `${Math.min(100, (limits.usedToday / limits.daily) * 100)}%` }} />
            </div>
            <div className="mt-4">
              <KV k="Успішних угод" v={p.successful_deals} />
              <KV k="Спорів / програно" v={`${p.disputes_count} / ${p.disputes_lost}`} />
              {limits.nextTier && (
                <KV k="Наступний рівень" v={`після ${limits.nextTier.minDeals} угод: ${fmtNum(limits.nextTier.single)} / ${fmtNum(limits.nextTier.daily)} USDT`} />
              )}
            </div>
          </Card>
        )}

        {actor.status === "approved" && <TelegramCard toast={toast} />}
        {actor.status === "approved" && <TestTokens toast={toast} />}

        {!!me.data?.requests?.length && (
          <Card title="Запити на зміни">
            {me.data.requests.map((r) => (
              <KV
                key={String(r.id)}
                k={`${r.kind === "card" ? "Картка" : "Гаманець"} · ${fmtDate(r.created_at)}`}
                v={<Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status === "approved" ? "схвалено" : r.status === "rejected" ? "відхилено" : "на розгляді"}</Badge>}
              />
            ))}
          </Card>
        )}
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Редагувати профіль">
        <EditProfile
          initial={{ display_name: p.display_name ?? "", telegram: p.telegram ?? "" }}
          card={{ card_holder_name: p.card_holder_name ?? "", card_last4: p.card_last4 ?? "" }}
          onDone={() => {
            setEdit(false);
            refresh();
            toast.ok("Збережено");
          }}
        />
      </Modal>
      <Modal open={card} onClose={() => setCard(false)} title="Змінити картку">
        <CardChange
          onDone={() => {
            setCard(false);
            refresh();
            toast.ok("Запит надіслано адміністратору");
          }}
        />
      </Modal>
      <Modal open={wallet} onClose={() => setWallet(false)} title="Змінити гаманець">
        <WalletChange
          current={actor.wallet_address}
          onDone={() => {
            setWallet(false);
            refresh();
            toast.ok("Запит надіслано адміністратору");
          }}
        />
      </Modal>
      {toast.node}
    </div>
  );
}

function EditProfile({ initial, card, onDone }: { initial: { display_name: string; telegram: string }; card: { card_holder_name: string; card_last4: string }; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await api("/api/me/profile", { method: "PUT", body: { ...f, ...card } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-4">
      <Field label="Ім'я">
        <Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
      </Field>
      <Field label="Telegram">
        <Input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} />
      </Field>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button className="w-full" onClick={save}>
        Зберегти
      </Button>
    </div>
  );
}

function CardChange({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ card_holder_name: "", card_last4: "" });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await api("/api/me/change-request", { body: { kind: "card", ...f } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-4">
      <Alert tone="info">Нова картка запрацює після повторного схвалення адміністратором. Активні угоди мають бути завершені.</Alert>
      <Field label="Ім'я власника картки">
        <Input value={f.card_holder_name} onChange={(e) => setF({ ...f, card_holder_name: e.target.value })} />
      </Field>
      <Field label="Останні 4 цифри">
        <Input inputMode="numeric" value={f.card_last4} onChange={(e) => setF({ ...f, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
      </Field>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button className="w-full" onClick={save}>
        Надіслати запит
      </Button>
    </div>
  );
}

function WalletChange({ current, onDone }: { current: string; onDone: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = address && address.toLowerCase() !== current;
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const w = address!.toLowerCase();
      const { message } = await api<{ message: string }>(`/api/me/change-request?wallet=${w}`);
      const signature = await signMessageAsync({ message });
      await api("/api/me/change-request", { body: { kind: "wallet", wallet_address: w, message, signature } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        1) Перемкніть у гаманці акаунт на <b>новий</b> гаманець. 2) Підпишіть повідомлення — це доводить володіння. 3) Після схвалення адміністратором увійдіть заново з новим гаманцем.
      </p>
      <KV k="Поточний" v={shortAddr(current)} mono />
      <KV k="Підключено зараз" v={shortAddr(address)} mono />
      {!isNew && <Alert tone="warn">Підключений гаманець збігається з поточним — перемкніть акаунт у гаманці.</Alert>}
      {err && <Alert tone="bad">{err}</Alert>}
      <Button className="w-full" disabled={!isNew} loading={busy} onClick={go}>
        Підписати новим гаманцем
      </Button>
    </div>
  );
}

function TestTokens({ toast }: { toast: ReturnType<typeof useToast> }) {
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<{ usdt: Address | null; escrow: Address | null }>("/api/config"), staleTime: Infinity });
  const tx = useEscrowTx();
  const { watchAssetAsync } = useWatchAsset();
  const [busy, setBusy] = useState(false);
  const usdt = cfg.data?.usdt;
  if (!usdt) return null;
  const faucet = async () => {
    setBusy(true);
    try {
      await tx.ensure();
      await tx.usdt.faucet(usdt);
      toast.ok("Отримано 1000 mUSDT");
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Тестові токени">
      <p className="text-sm text-ink-2">
        Площадка працює в BSC Testnet з тестовим токеном mUSDT. Газ — тестові BNB з фаусета BNB Chain (див. README).
      </p>
      <KV k="mUSDT" v={usdt} mono />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={faucet} loading={busy}>
          Отримати 1000 mUSDT
        </Button>
        <Button size="sm" variant="secondary" onClick={() => watchAssetAsync({ type: "ERC20", options: { address: usdt, symbol: "mUSDT", decimals: 18 } }).catch(() => {})}>
          Додати токен у гаманець
        </Button>
      </div>
    </Card>
  );
}

function TelegramCard({ toast }: { toast: ReturnType<typeof useToast> }) {
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<{ telegram: boolean }>("/api/config"), staleTime: Infinity });
  const me = useMe();
  const refresh = useRefreshMe();
  const [busy, setBusy] = useState(false);
  if (!cfg.data?.telegram) return null;
  const linked = me.data?.telegram;
  const connect = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string | null; code: string }>("/api/me/telegram", { body: {} });
      if (r.url) window.open(r.url, "_blank", "noopener");
      toast.ok("Відкрийте бота в Telegram і натисніть «Start»");
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    await api("/api/me/telegram", { method: "DELETE" }).catch((e) => toast.bad(errorText(e)));
    refresh();
  };
  return (
    <Card title="Сповіщення в Telegram" actions={<Badge tone={linked ? "ok" : "muted"}>{linked ? "підключено" : "вимкнено"}</Badge>}>
      <p className="text-sm text-ink-2">Нові угоди, депозит, оплата, спори та рішення — одразу в Telegram, навіть коли сайт закрито.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {linked ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => refresh()}>
              Оновити статус
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              Відключити
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={connect} loading={busy}>
              Підключити Telegram
            </Button>
            <Button size="sm" variant="ghost" onClick={() => refresh()}>
              Я натиснув Start
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
