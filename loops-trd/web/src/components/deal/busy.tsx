import type { ReactNode } from "react";
import { Spinner } from "../ui";

export function Busy({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-2" role="status" aria-live="polite">
      <Spinner size={16} /> <span>{children}</span>
      <span className="text-xs text-ink-3">· підтвердьте в гаманці, якщо він попросить</span>
    </div>
  );
}
