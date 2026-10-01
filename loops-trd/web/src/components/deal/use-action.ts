"use client";

import { useState } from "react";
import { errorText } from "@/lib/api";
import type { ActionProps } from "./types";

/** Запуск дії з індикатором кроку, зрозумілою помилкою та оновленням угоди наприкінці. */
export function useDealAction({ refresh, toast }: Pick<ActionProps, "refresh" | "toast">) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: (step: (s: string) => void) => Promise<void>, okText?: string) => {
    setBusy(label);
    try {
      await fn(setBusy);
      if (okText) toast.ok(okText);
    } catch (e) {
      toast.bad(errorText(e));
    } finally {
      setBusy(null);
      await refresh();
    }
  };
  return { busy, run };
}
