import { randomBytes, timingSafeEqual } from "crypto";
import type { Db } from "./db";
import { one } from "./db";

/**
 * Telegram-бот для сповіщень. Вмикається, лише якщо задано TELEGRAM_BOT_TOKEN.
 * Прив'язка: учасник у кабінеті отримує посилання t.me/<bot>?start=<код>, бот отримує /start <код>.
 * Відправка — через outbox у таблиці notifications (telegram_sent_at), тож HTTP-запити до Telegram
 * ніколи не виконуються всередині транзакцій БД і не дублюються.
 */
const API = "https://api.telegram.org";

export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const telegramBotUsername = () => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;

export async function sendTelegram(chatId: number | string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Без parse_mode: текст надсилається як є, жодної HTML/Markdown-ін'єкції.
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!res?.ok;
}

export async function createLinkCode(db: Db, userId: string) {
  const code = randomBytes(12).toString("base64url");
  await db.query(`delete from telegram_link_codes where user_id = $1 or expires_at < now()`, [userId]);
  await db.query(`insert into telegram_link_codes (code, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')`, [code, userId]);
  const bot = telegramBotUsername();
  return { code, url: bot ? `https://t.me/${bot}?start=${code}` : null };
}

export async function unlinkTelegram(db: Db, userId: string) {
  await db.query(`delete from telegram_links where user_id = $1`, [userId]);
}

export function verifyWebhookSecret(header: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TgUpdate {
  message?: { chat?: { id?: number; type?: string }; from?: { username?: string }; text?: string };
}

/** Обробка вхідного оновлення від Telegram. Повертає текст відповіді (для тестів). */
export async function handleTelegramUpdate(db: Db, update: TgUpdate): Promise<string | null> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text?.trim() ?? "";
  if (!chatId || msg?.chat?.type !== "private") return null;
  let reply: string;
  const start = /^\/start(?:\s+([A-Za-z0-9_-]{8,64}))?$/.exec(text);
  if (start?.[1]) {
    const row = await one<{ user_id: string }>(
      db,
      `delete from telegram_link_codes where code = $1 and expires_at > now() returning user_id`,
      [start[1]],
    );
    if (!row) {
      reply = "Код недійсний або прострочений. Отримайте нове посилання в кабінеті Loops Trd.";
    } else {
      await db.query(`delete from telegram_links where chat_id = $1`, [chatId]);
      await db.query(
        `insert into telegram_links (user_id, chat_id, username) values ($1, $2, $3)
         on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username, linked_at = now()`,
        [row.user_id, chatId, msg?.from?.username ?? null],
      );
      reply = "✅ Сповіщення Loops Trd підключено: нові угоди, оплата, спори. Відключити — /stop";
    }
  } else if (text === "/stop") {
    await db.query(`delete from telegram_links where chat_id = $1`, [chatId]);
    reply = "Сповіщення вимкнено. Підключити знову можна в кабінеті Loops Trd.";
  } else {
    reply = "Це бот сповіщень Loops Trd. Щоб підключитися, натисніть «Підключити Telegram» у кабінеті на сайті.";
  }
  await sendTelegram(chatId, reply);
  return reply;
}

/** Надсилає накопичені сповіщення (за останню добу) тим, хто підключив Telegram. */
export async function flushTelegramOutbox(db: Db, limit = 50): Promise<{ sent: number; failed: number; disabled?: boolean }> {
  if (!telegramEnabled()) return { sent: 0, failed: 0, disabled: true };
  const claimed = (
    await db.query<{ id: string; chat_id: string; title: string; body: string | null; link: string | null }>(
      `update notifications n set telegram_sent_at = now()
       from telegram_links t
       where n.id in (
         select n2.id from notifications n2 join telegram_links t2 on t2.user_id = n2.user_id
         where n2.telegram_sent_at is null and n2.telegram_attempts < 3 and n2.created_at > now() - interval '1 day'
         order by n2.created_at limit $1 for update of n2 skip locked
       ) and t.user_id = n.user_id
       returning n.id, t.chat_id::text as chat_id, n.title, n.body, n.link`,
      [limit],
    )
  ).rows;
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;
  for (const n of claimed) {
    const text = [`🔔 ${n.title}`, n.body, n.link && base ? `${base}${n.link}` : null].filter(Boolean).join("\n");
    if (await sendTelegram(n.chat_id, text)) sent++;
    else {
      failed++;
      await db.query(`update notifications set telegram_sent_at = null, telegram_attempts = telegram_attempts + 1 where id = $1`, [n.id]);
    }
  }
  return { sent, failed };
}
