"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let deviceIdPromise: Promise<string | null> | null = null;

/** Відбиток браузера (FingerprintJS open-source). Використовується антифродом як один із сигналів. */
export function getDeviceId(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!deviceIdPromise) {
    deviceIdPromise = import("@fingerprintjs/fingerprintjs")
      .then((m) => m.load())
      .then((fp) => fp.get())
      .then((r) => r.visitorId)
      .catch(() => null);
  }
  return deviceIdPromise;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const device = await getDeviceId();
  if (device) headers["x-device-id"] = device;
  try {
    headers["x-timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `Помилка ${res.status}`), data.code as string | undefined, data);
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === "object" && "shortMessage" in e) return String((e as { shortMessage: string }).shortMessage);
  if (e instanceof Error) {
    if (/User rejected|User denied/i.test(e.message)) return "Дію скасовано в гаманці";
    return e.message.split("\n")[0].slice(0, 200);
  }
  return "Невідома помилка";
}
