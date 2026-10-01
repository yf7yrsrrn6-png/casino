"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Empty, PageTitle, Spinner, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { Guard } from "@/components/shell";
import { AdminNav } from "@/components/admin-nav";
import { EventsTable, StaffActionsTable, type EventRow, type StaffActionRow } from "@/components/staff-lists";
import { api } from "@/lib/api";

export default function AuditPage() {
  return (
    <Guard roles={["admin"]}>
      <Audit />
    </Guard>
  );
}

function Audit() {
  const [tab, setTab] = useState<"staff" | "deals" | "system">("staff");
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api<{ staffActions: StaffActionRow[]; dealEvents: EventRow[]; system: { id: number; level: string; source: string; message: string; created_at: string }[] }>("/api/admin/audit"),
  });
  return (
    <div>
      <PageTitle title="Журнал" sub="Усі дії адміністраторів і модераторів, а також події угод." />
      <AdminNav />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "staff", label: "Дії персоналу" },
            { value: "deals", label: "Події угод" },
            { value: "system", label: "Система" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : tab === "staff" ? (
        <StaffActionsTable items={q.data?.staffActions ?? []} />
      ) : tab === "deals" ? (
        <EventsTable items={q.data?.dealEvents ?? []} />
      ) : !q.data?.system.length ? (
        <Empty title="Системних подій немає" />
      ) : (
        <div className="grid gap-1.5">
          {q.data.system.map((e) => (
            <div key={e.id} className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface/80 px-3 py-2 text-[13px]">
              <Badge tone={e.level === "error" ? "bad" : e.level === "warn" ? "warn" : "muted"}>{e.source}</Badge>
              <span className="flex-1 min-w-48 text-ink-2">{e.message}</span>
              <span className="text-[11px] text-ink-3">{fmtDate(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
