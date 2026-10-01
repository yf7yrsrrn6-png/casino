"use client";

import { walletErrorText } from "./wallet-errors";

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

const TIMEOUT_MS = 25_000;

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const device = await getDeviceId();
  if (device) headers["x-device-id"] = device;
  try {
    headers["x-timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError(0, "Немає інтернету. Дія виконається, коли з'єднання відновиться — спробуйте ще раз.", "offline");
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ApiError(0, timeout ? "Сервер відповідає надто довго. Перевірте з'єднання й спробуйте ще раз." : "Не вдалося з'єднатися із сервером. Перевірте інтернет.", "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `Помилка ${res.status}`), data.code as string | undefined, data);
  return data as T;
}

/** Будь-яка помилка → один зрозумілий рядок українською. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const w = walletErrorText(e);
  if (w) return w;
  if (e instanceof Error && /[А-Яа-яІіЇїЄєҐґ]/.test(e.message)) return e.message.split("\n")[0].slice(0, 300);
  return "Щось пішло не так. Оновіть сторінку й спробуйте ще раз.";
}
