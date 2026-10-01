import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || "testnet",
    // Трейсинг вимкнено; персональні дані (cookie, IP) Sentry за замовчуванням не надсилає.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
