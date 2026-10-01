"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const items = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/users", label: "Учасники" },
  { href: "/mod", label: "Спори" },
  { href: "/admin/antifraud", label: "Антифрод" },
  { href: "/admin/audit", label: "Журнал" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto -mx-4 px-4 pb-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cx(
            "h-9 px-3.5 inline-flex items-center rounded-lg text-[13px] font-medium whitespace-nowrap border",
            path === i.href ? "bg-surface-3 border-line-strong text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
