"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageTitle, Spinner, Stat, Tabs } from "@/components/ui";
import { Guard } from "@/components/shell";
import { DisputeList, EventsTable, FlaggedList, StaffActionsTable, type EventRow, type QueueDeal, type QueueDispute, type StaffActionRow } from "@/components/staff-lists";
import { api } from "@/lib/api";

export default function ModPage() {
  return (
    <Guard roles={["moderator", "admin"]}>
      <Mod />
    </Guard>
  );
}

function Mod() {
  const [tab, setTab] = useState<"disputes" | "flagged" | "log">("disputes");
  const q = useQuery({
    queryKey: ["mod-queue"],
    queryFn: () => api<{ disputes: QueueDispute[]; flagged: QueueDeal[] }>("/api/mod/queue"),
    refetchInterval: 15_000,
  });
  const log = useQuery({
    queryKey: ["mod-log"],
    queryFn: () => api<{ dealEvents: EventRow[]; staffActions: StaffActionRow[] }>("/api/mod/log"),
    enabled: tab === "log",
  });
  return (
    <div>
      <PageTitle title="Модерація" sub="Розгляд спорів і зупинених угод. Модератор рекомендує — рішення ухвалює адміністратор." />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Stat label="Відкриті спори" value={q.data?.disputes.length ?? "…"} tone={q.data?.disputes.length ? "bad" : undefined} />
        <Stat label="Заморожені" value={q.data?.flagged.filter((d) => d.frozen).length ?? "…"} tone="warn" />
        <Stat label="Чекають перевірки" value={q.data?.flagged.filter((d) => d.release_check === "staff" && !d.release_check_done).length ?? "…"} />
      </div>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "disputes", label: "Спори" },
            { value: "flagged", label: "Зупинені та ризикові" },
            { value: "log", label: "Журнал" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : tab === "disputes" ? (
        <DisputeList items={q.data?.disputes ?? []} />
      ) : tab === "flagged" ? (
        <FlaggedList items={q.data?.flagged ?? []} />
      ) : log.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">Події угод</h2>
            <EventsTable items={log.data?.dealEvents ?? []} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">Мої дії</h2>
            <StaffActionsTable items={log.data?.staffActions ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
