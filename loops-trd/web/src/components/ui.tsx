"use client";

import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lt-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b6cff" />
          <stop offset="1" stopColor="#2ee6d6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#11131b" stroke="url(#lt-g)" strokeOpacity=".5" />
      <path
        d="M9.5 16c0-2.2 1.6-3.8 3.6-3.8 3.4 0 4.4 7.6 7.8 7.6 2 0 3.6-1.6 3.6-3.8s-1.6-3.8-3.6-3.8c-3.4 0-4.4 7.6-7.8 7.6-2 0-3.6-1.6-3.6-3.8Z"
        stroke="url(#lt-g)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <LogoMark />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight">
          Loops <span className="brand-text">Trd</span>
        </span>
      )}
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ok";
export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  // На телефоні — цілі для дотику ≥ 40–44 px; на десктопі — компактніші.
  const sizes = { sm: "h-10 sm:h-8 px-3 text-[13px]", md: "h-11 sm:h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" };
  const variants: Record<BtnVariant, string> = {
    primary: "brand-gradient text-[#0b0b12] font-semibold shadow-[0_8px_30px_-10px_rgba(139,108,255,.7)] hover:brightness-110",
    secondary: "bg-surface-3 text-ink border border-line-strong hover:bg-[#232840]",
    ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
    danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
    ok: "bg-ok/15 text-ok border border-ok/30 hover:bg-ok/25",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="lt-spin inline-block rounded-full border-2 border-current border-r-transparent opacity-80"
      style={{ width: size, height: size }}
      aria-label="Завантаження"
    />
  );
}

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-surface/80 backdrop-blur p-4 sm:p-5", className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const tones = {
  info: "bg-sky-400/10 text-sky-300 border-sky-400/25",
  ok: "bg-ok/10 text-ok border-ok/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  muted: "bg-surface-3 text-ink-3 border-line",
  brand: "bg-brand/12 text-[#b8a6ff] border-brand/30",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="block text-xs text-bad">{error}</span> : hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line-strong bg-surface-2 px-3 h-11 text-[15px] text-ink placeholder:text-ink-3 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "h-auto min-h-24 py-2.5", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "pr-8", props.className)} />;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const icon = { info: "ℹ", warn: "⚠", bad: "⛔", ok: "✓" }[tone];
  return (
    <div className={cx("rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed", tones[tone])}>
      <div className="flex gap-2.5">
        <span className="mt-px shrink-0">{icon}</span>
        <div className="min-w-0">
          {title && <div className="font-semibold mb-0.5">{title}</div>}
          {children && <div className="text-ink-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center">
      <div className="text-[15px] font-medium text-ink-2">{title}</div>
      {children && <div className="mt-2 text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1 overflow-x-auto max-w-full">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          aria-pressed={value === i.value}
          className={cx(
            "h-10 sm:h-8 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap transition",
            value === i.value ? "bg-surface-3 text-ink shadow-sm border border-line-strong" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="h-10 w-10 rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Закрити">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tabular", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Countdown({ to }: { to: string | Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(to).getTime() - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={cx("tabular font-mono font-semibold", left < 5 * 60000 ? "text-bad" : "text-ink")}>
      {left === 0 ? "час минув" : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-line/60 last:border-0">
      <span className="text-[13px] text-ink-3 shrink-0">{k}</span>
      <span className={cx("text-[13.5px] text-right text-ink min-w-0", mono ? "font-mono text-[12.5px] break-all" : "break-words")}>{v}</span>
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-3">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md">
      <div role="alert" className={cx("rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur", msg.tone === "ok" ? "bg-[#0d2a20]/95 border-ok/30 text-ok" : "bg-[#2a1214]/95 border-bad/30 text-bad")}>
        {msg.text}
      </div>
    </div>
  ) : null;
  return { node, ok: (text: string) => setMsg({ text, tone: "ok" }), bad: (text: string) => setMsg({ text, tone: "bad" }) };
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Банер «немає інтернету» — з'являється автоматично при втраті з'єднання. На сервері завжди «онлайн». */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-14 z-30 bg-warn/15 border-b border-warn/30 px-4 py-2 text-center text-[13px] text-warn">
      Немає інтернету. Дані можуть бути застарілими — дії виконаються після відновлення з&apos;єднання.
    </div>
  );
}

/** Поточний час, що оновлюється з інтервалом — для таймерів і станів «дедлайн минув». */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
