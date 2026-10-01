"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Button, Card, cx } from "./ui";

interface Msg {
  id: string;
  sender_id: string | null;
  is_system: boolean;
  body: string;
  created_at: string;
  sender_name: string | null;
  sender_role: string | null;
}

export function DealChat({ dealId, myId, closed }: { dealId: string; myId: string; closed: boolean }) {
  const q = useQuery({
    queryKey: ["chat", dealId],
    queryFn: () => api<{ messages: Msg[] }>(`/api/deals/${dealId}/messages`),
    refetchInterval: closed ? false : 4000,
  });
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = q.data?.messages.length ?? 0;
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [count]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/deals/${dealId}/messages`, { body: { body: text } });
      setText("");
      q.refetch();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Чат угоди" className="flex flex-col">
      <div className="h-80 lg:h-[26rem] overflow-y-auto space-y-2 pr-1 -mr-1">
        {q.data?.messages.map((m) =>
          m.is_system ? (
            <div key={m.id} className="mx-auto max-w-[92%] rounded-xl bg-surface-2 border border-line px-3 py-2 text-xs text-ink-2 text-center">
              {m.body}
            </div>
          ) : (
            <div key={m.id} className={cx("flex", m.sender_id === myId ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  m.sender_id === myId ? "bg-brand/20 border border-brand/30 rounded-br-md" : "bg-surface-3 border border-line rounded-bl-md",
                )}
              >
                {m.sender_id !== myId && (
                  <div className="text-[11px] font-medium text-ink-3 mb-0.5">
                    {m.sender_name ?? "Учасник"}
                    {m.sender_role && m.sender_role !== "member" ? ` · ${m.sender_role === "admin" ? "адмін" : "модератор"}` : ""}
                  </div>
                )}
                {m.body}
                <div className="mt-0.5 text-[10px] text-ink-3 text-right">{fmtDate(m.created_at)}</div>
              </div>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {closed ? (
        <div className="mt-3 text-xs text-ink-3 text-center">Угоду закрито — чат лише для читання. Номери карток замасковано.</div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            maxLength={2000}
            placeholder="Повідомлення…"
            className="flex-1 h-10 rounded-xl border border-line-strong bg-surface-2 px-3 text-sm outline-none focus:border-brand"
          />
          <Button onClick={send} loading={busy} disabled={!text.trim()}>
            ↑
          </Button>
        </div>
      )}
      {err && <div className="mt-2 text-xs text-bad">{err}</div>}
    </Card>
  );
}
