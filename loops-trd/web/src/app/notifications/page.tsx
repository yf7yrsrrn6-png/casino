"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Empty, PageTitle, Spinner, cx } from "@/components/ui";
import { Guard } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

interface N {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  return (
    <Guard need="auth">
      <Notifications />
    </Guard>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications-list"], queryFn: () => api<{ items: N[] }>("/api/notifications") });
  useEffect(() => {
    if (!q.data) return;
    api("/api/notifications/read", { body: {} }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
  }, [q.data, qc]);

  return (
    <div className="max-w-2xl">
      <PageTitle title="Сповіщення" />
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.items.length ? (
        <Empty title="Сповіщень немає" />
      ) : (
        <div className="grid gap-2">
          {q.data.items.map((n) => {
            const inner = (
              <div className={cx("rounded-2xl border p-4 transition", n.read_at ? "border-line bg-surface/60" : "border-brand/30 bg-brand/5")}>
                <div className="flex justify-between gap-3">
                  <div className="font-medium text-[14px]">{n.title}</div>
                  <div className="text-xs text-ink-3 shrink-0">{fmtDate(n.created_at)}</div>
                </div>
                {n.body && <div className="mt-1 text-sm text-ink-2 whitespace-pre-line">{n.body}</div>}
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link}>
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
