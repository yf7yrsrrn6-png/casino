import * as Sentry from "@sentry/nextjs";

/** Звітування про помилки: Sentry (якщо задано SENTRY_DSN) + консоль хостингу. */
export function reportError(e: unknown, context: Record<string, unknown> = {}) {
  console.error("[error]", context, e);
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(e, { extra: context });
  }
}
