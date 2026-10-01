"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageTitle, Spinner, Tabs } from "@/components/ui";
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
  const [tab, setTab] = useState<"staff" | "deals">("staff");
  const q = useQuery({ queryKey: ["audit"], queryFn: () => api<{ staffActions: StaffActionRow[]; dealEvents: EventRow[] }>("/api/admin/audit") });
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
          ]}
        />
      </div>
      {q.isLoading ? <Spinner /> : tab === "staff" ? <StaffActionsTable items={q.data?.staffActions ?? []} /> : <EventsTable items={q.data?.dealEvents ?? []} />}
    </div>
  );
}
