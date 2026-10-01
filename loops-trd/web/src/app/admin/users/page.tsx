"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageTitle, Select, Spinner, Tabs, useToast } from "@/components/ui";
import { Guard } from "@/components/shell";
import { AdminNav } from "@/components/admin-nav";
import { useSignAction } from "@/components/session";
import { api, errorText } from "@/lib/api";
import { ROLE_LABEL, USER_STATUS, fmtDate, fmtNum, shortAddr } from "@/lib/format";

interface U {
  id: string;
  wallet_address: string;
  role: string;
  status: string;
  display_name: string | null;
  telegram: string | null;
  card_holder_name: string | null;
  card_last4: string | null;
  profile_completed: boolean;
  successful_deals: number;
  disputes_count: number;
  disputes_lost: number;
  single_limit_override: string | null;
  daily_limit_override: string | null;
  status_reason: string | null;
  created_at: string;
}
interface CR {
  id: string;
  user_id: string;
  kind: "card" | "wallet";
  display_name: string;
  wallet_address: string;
  card_holder_name: string;
  card_last4: string;
  new_card_holder_name: string | null;
  new_card_last4: string | null;
  new_wallet_address: string | null;
  created_at: string;
}
interface Inv {
  id: string;
  code_hint: string;
  note: string | null;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function UsersPage() {
  return (
    <Guard roles={["admin"]}>
      <Users />
    </Guard>
  );
}

function Users() {
  const [tab, setTab] = useState<"apps" | "all" | "changes" | "invites">("apps");
  const [sel, setSel] = useState<U | null>(null);
  const toast = useToast();
  const sign = useSignAction();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api<{ users: U[]; changeRequests: CR[]; invites: Inv[] }>("/api/admin/users") });
  const users = q.data?.users ?? [];
  const apps = users.filter((u) => u.status === "pending");

  const reviewChange = async (r: CR, approve: boolean) => {
    try {
      const input = { approve };
      const signed = await sign("change_request.review", { requestId: r.id, ...input });
      await api(`/api/admin/change-requests/${r.id}`, { body: { input, signed } });
      toast.ok(approve ? "Зміну схвалено" : "Зміну відхилено");
      q.refetch();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };

  return (
    <div>
      <PageTitle title="Учасники" sub="Критичні дії підтверджуються підписом гаманця адміністратора." />
      <AdminNav />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "apps", label: `Заявки (${apps.length})` },
            { value: "all", label: `Усі (${users.length})` },
            { value: "changes", label: `Зміни (${q.data?.changeRequests.length ?? 0})` },
            { value: "invites", label: "Інвайт-коди" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : tab === "apps" || tab === "all" ? (
        <UserList items={tab === "apps" ? apps : users} onSelect={setSel} />
      ) : tab === "changes" ? (
        !q.data?.changeRequests.length ? (
          <Empty title="Запитів на зміну немає" />
        ) : (
          <div className="grid gap-2">
            {q.data.changeRequests.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {r.display_name} · {r.kind === "card" ? "зміна картки" : "зміна гаманця"}
                    </div>
                    <div className="text-ink-3 text-xs mt-0.5">
                      {r.kind === "card"
                        ? `${r.card_holder_name} *${r.card_last4} → ${r.new_card_holder_name} *${r.new_card_last4}`
                        : `${shortAddr(r.wallet_address)} → ${shortAddr(r.new_wallet_address)} (володіння підтверджено підписом)`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ok" onClick={() => reviewChange(r, true)}>
                      Схвалити
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => reviewChange(r, false)}>
                      Відхилити
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Invites items={q.data?.invites ?? []} refetch={q.refetch} toast={toast} />
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.display_name ?? shortAddr(sel?.wallet_address)}>
        {sel && (
          <UserActions
            u={sel}
            toast={toast}
            onDone={() => {
              setSel(null);
              q.refetch();
            }}
          />
        )}
      </Modal>
      {toast.node}
    </div>
  );
}

function UserList({ items, onSelect }: { items: U[]; onSelect: (u: U) => void }) {
  if (!items.length) return <Empty title="Нікого немає" />;
  return (
    <div className="grid gap-2">
      {items.map((u) => {
        const st = USER_STATUS[u.status];
        return (
          <button key={u.id} onClick={() => onSelect(u)} className="text-left rounded-2xl border border-line bg-surface/80 hover:bg-surface-2 p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <div className="font-medium">
                {u.display_name ?? "Без імені"} <span className="text-ink-3 text-sm">{u.telegram}</span>
              </div>
              <div className="text-xs text-ink-3 font-mono">{shortAddr(u.wallet_address)}</div>
            </div>
            <div className="text-xs text-ink-2 min-w-40">
              {u.card_holder_name ? `${u.card_holder_name} · *${u.card_last4}` : "профіль не заповнено"}
              <div className="text-ink-3">
                {u.successful_deals} угод · спорів {u.disputes_count}/{u.disputes_lost}
              </div>
            </div>
            <div className="flex gap-1">
              {u.role !== "member" && <Badge tone="brand">{ROLE_LABEL[u.role]}</Badge>}
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function UserActions({ u, toast, onDone }: { u: U; toast: ReturnType<typeof useToast>; onDone: () => void }) {
  const sign = useSignAction();
  const [reason, setReason] = useState("");
  const [role, setRole] = useState(u.role);
  const [lim, setLim] = useState({ single: u.single_limit_override ?? "", daily: u.daily_limit_override ?? "" });
  const [busy, setBusy] = useState(false);

  const act = async (input: Record<string, unknown>) => {
    setBusy(true);
    try {
      const signed = await sign(`user.${input.action}`, { userId: u.id, ...input });
      await api(`/api/admin/users/${u.id}`, { body: { input, signed } });
      toast.ok("Виконано");
      onDone();
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const r = reason.trim();

  return (
    <div className="space-y-5">
      <div className="text-sm space-y-1">
        <div>
          <span className="text-ink-3">Гаманець:</span> <span className="font-mono text-xs break-all">{u.wallet_address}</span>
        </div>
        <div>
          <span className="text-ink-3">Картка:</span> {u.card_holder_name ?? "—"} {u.card_last4 && `*${u.card_last4}`}
        </div>
        <div>
          <span className="text-ink-3">Заявка:</span> {fmtDate(u.created_at)}
        </div>
        {u.status_reason && <Alert tone="warn">{u.status_reason}</Alert>}
        <Link href={`/admin/antifraud?user=${u.id}`} className="inline-block text-brand-2 text-sm hover:underline">
          Граф зв&apos;язків →
        </Link>
      </div>

      <Field label="Причина (для відхилення / блокування)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {u.status === "pending" && (
          <Button variant="ok" loading={busy} disabled={!u.profile_completed} onClick={() => act({ action: "approve" })}>
            Схвалити
          </Button>
        )}
        {u.status === "pending" && (
          <Button variant="danger" loading={busy} disabled={r.length < 3} onClick={() => act({ action: "reject", reason: r })}>
            Відхилити
          </Button>
        )}
        {u.status === "approved" && (
          <Button variant="danger" loading={busy} disabled={r.length < 3} onClick={() => act({ action: "block", reason: r })}>
            Заблокувати
          </Button>
        )}
        {(u.status === "blocked" || u.status === "rejected") && (
          <Button variant="ok" loading={busy} onClick={() => act({ action: u.status === "blocked" ? "unblock" : "approve" })}>
            {u.status === "blocked" ? "Розблокувати" : "Схвалити"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Учасник</option>
            <option value="moderator">Модератор</option>
            <option value="admin">Адміністратор</option>
          </Select>
        </Field>
        <Button variant="secondary" loading={busy} disabled={role === u.role} onClick={() => act({ action: "set_role", role })}>
          Змінити
        </Button>
      </div>

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5">Персональні ліміти, USDT (порожньо = за рівнем)</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input placeholder="разовий" inputMode="decimal" value={lim.single} onChange={(e) => setLim({ ...lim, single: e.target.value })} />
          <Input placeholder="добовий" inputMode="decimal" value={lim.daily} onChange={(e) => setLim({ ...lim, daily: e.target.value })} />
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => act({ action: "set_limits", single: lim.single === "" ? null : Number(lim.single), daily: lim.daily === "" ? null : Number(lim.daily) })}
          >
            Зберегти
          </Button>
        </div>
        <div className="mt-1 text-xs text-ink-3">
          Зараз: {u.single_limit_override ? fmtNum(u.single_limit_override) : "авто"} / {u.daily_limit_override ? fmtNum(u.daily_limit_override) : "авто"}
        </div>
      </div>
    </div>
  );
}

function Invites({ items, refetch, toast }: { items: Inv[]; refetch: () => void; toast: ReturnType<typeof useToast> }) {
  const [days, setDays] = useState("3");
  const [note, setNote] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await api<{ code: string }>("/api/admin/invites", { body: { days: Number(days), note: note || undefined } });
      setCode(r.code);
      setNote("");
      refetch();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };
  const revoke = async (id: string) => {
    try {
      await api(`/api/admin/invites/${id}`, { method: "DELETE" });
      refetch();
    } catch (e) {
      toast.bad(errorText(e));
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card title="Новий інвайт-код">
        <div className="space-y-3">
          <Field label="Діє днів (1–30)">
            <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Для кого (нотатка)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Андрій, колега" />
          </Field>
          <Button className="w-full" onClick={create}>
            Згенерувати
          </Button>
          {code && (
            <Alert tone="ok" title="Код (показується один раз)">
              <div className="mt-1 flex items-center gap-2">
                <code className="text-base font-mono text-ink">{code}</code>
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(code).then(() => toast.ok("Скопійовано"))}>
                  Копіювати
                </Button>
              </div>
            </Alert>
          )}
        </div>
      </Card>
      <Card title="Видані коди">
        {!items.length ? (
          <p className="text-sm text-ink-3">Ще немає.</p>
        ) : (
          <div className="space-y-1">
            {items.map((i) => {
              const state = i.used_at ? "використано" : i.revoked_at ? "відкликано" : new Date(i.expires_at) < new Date() ? "прострочено" : "активний";
              return (
                <div key={i.id} className="flex items-center gap-2 text-[13px] py-1.5 border-b border-line/50 last:border-0">
                  <code className="font-mono text-ink-2">…{i.code_hint}</code>
                  <span className="flex-1 truncate text-ink-3">{i.note}</span>
                  <span className="text-[11px] text-ink-3">до {fmtDate(i.expires_at)}</span>
                  <Badge tone={state === "активний" ? "ok" : "muted"}>{state}</Badge>
                  {state === "активний" && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>
                      ✕
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
