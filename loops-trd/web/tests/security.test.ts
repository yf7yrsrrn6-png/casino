import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientIp, getActor } from "@/server/auth";
import { signSession, verifySession, SESSION_COOKIE } from "@/server/session";
import { createLinkCode, flushTelegramOutbox, handleTelegramUpdate, verifyWebhookSecret } from "@/server/telegram";
import * as identity from "@/server/services/identity";
import { HttpError } from "@/server/errors";
import { createTestDb, createUser, makeCtx, meta, siwe } from "./harness";
import type { NextRequest } from "next/server";

let db: Db;
beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe("Обмеження частоти запитів", () => {
  it("пропускає ліміт і повертає 429 з Retry-After понад нього", async () => {
    for (let i = 0; i < 3; i++) await enforceRateLimit(db, "t:1", 3, 60);
    const e = await enforceRateLimit(db, "t:1", 3, 60).catch((x) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(429);
    expect(e.extra.retryAfter).toBeGreaterThan(0);
    // інший ключ — окремий лічильник
    await enforceRateLimit(db, "t:2", 3, 60);
  });
  it("вікно скидається після закінчення", async () => {
    for (let i = 0; i < 2; i++) await enforceRateLimit(db, "t:w", 2, 60);
    await db.query(`update rate_limits set expires_at = now() - interval '1 second' where key = 't:w'`);
    await enforceRateLimit(db, "t:w", 2, 60);
  });
});

describe("IP клієнта", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  afterEach(() => {
    delete process.env.TRUSTED_IP_HEADER;
    delete process.env.TRUST_PROXY_HOPS;
  });
  it("підроблений клієнтом X-Forwarded-For ігнорується: береться запис найближчого проксі", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toEqual({ ip: "203.0.113.7", spoofHint: true });
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toEqual({ ip: "203.0.113.7", spoofHint: false });
  });
  it("TRUSTED_IP_HEADER має пріоритет; сміття замість IP відкидається", () => {
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    expect(clientIp(h({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "6.6.6.6" })).ip).toBe("198.51.100.1");
    expect(clientIp(h({ "x-real-ip": "<script>" })).ip).toBeNull();
  });
  it("TRUST_PROXY_HOPS = 2 (Cloudflare + балансувальник)", () => {
    process.env.TRUST_PROXY_HOPS = "2";
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 198.51.100.2, 10.0.0.1" })).ip).toBe("198.51.100.2");
  });
});

describe("Сесії", () => {
  const req = (token: string) => ({ cookies: { get: (n: string) => (n === SESSION_COOKIE ? { value: token } : undefined) } }) as unknown as NextRequest;
  it("відкликаний токен (вихід) більше не діє", async () => {
    const u = await createUser(db);
    const token = await signSession({ sub: u.actor.id, wallet: u.wallet });
    expect((await getActor(req(token), db))?.id).toBe(u.actor.id);
    const s = (await verifySession(token))!;
    await db.query(`insert into revoked_sessions (jti, expires_at) values ($1, to_timestamp($2))`, [s.jti, s.exp]);
    expect(await getActor(req(token), db)).toBeNull();
  });
  it("підроблений або чужий токен не приймається; заблокований учасник втрачає сесію", async () => {
    const u = await createUser(db);
    const token = await signSession({ sub: u.actor.id, wallet: u.wallet });
    expect(await getActor(req(token.slice(0, -2) + "xx"), db)).toBeNull();
    await db.query(`update profiles set status = 'blocked' where id = $1`, [u.actor.id]);
    expect(await getActor(req(token), db)).toBeNull();
  });
});

describe("SIWE", () => {
  it("відхиляє повідомлення з чужою адресою сайту (uri)", async () => {
    const ctx = makeCtx(db);
    const u = await createUser(db);
    const { nonce } = await identity.createLoginNonce(ctx, u.wallet);
    const good = await siwe(u, nonce);
    const message = good.replace("URI: https://loops.test", "URI: https://evil.example");
    const e = await identity.loginWithSiwe(ctx, { message, signature: await u.sign(message) }, meta()).catch((x) => x);
    expect(e.status).toBe(400);
  });
});

describe("Telegram", () => {
  const sent: { chat_id: number | string; text: string }[] = [];
  beforeEach(() => {
    sent.length = 0;
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_BOT_USERNAME = "loops_trd_bot";
    process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
    process.env.APP_URL = "https://loops.test";
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("прив'язка через /start <код>, сповіщення доходять один раз, /stop відключає", async () => {
    const u = await createUser(db);
    const { code, url } = await createLinkCode(db, u.actor.id);
    expect(url).toBe(`https://t.me/loops_trd_bot?start=${code}`);
    expect(await handleTelegramUpdate(db, { message: { chat: { id: 555, type: "private" }, text: `/start ${code}` } })).toMatch(/підключено/);
    // код одноразовий
    expect(await handleTelegramUpdate(db, { message: { chat: { id: 556, type: "private" }, text: `/start ${code}` } })).toMatch(/недійсний/);

    await db.query(`insert into notifications (user_id, kind, title, body, link) values ($1, 'deal', 'Нова угода', '50 USDT', '/deals/x')`, [u.actor.id]);
    sent.length = 0;
    expect(await flushTelegramOutbox(db)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]).toMatchObject({ chat_id: "555" });
    expect(sent[0].text).toContain("https://loops.test/deals/x");
    expect(await flushTelegramOutbox(db)).toEqual({ sent: 0, failed: 0 });

    await handleTelegramUpdate(db, { message: { chat: { id: 555, type: "private" }, text: "/stop" } });
    expect((await db.query(`select 1 from telegram_links`)).rows).toHaveLength(0);
  });

  it("невдала відправка повторюється, але не більше 3 разів; групові чати ігноруються", async () => {
    const u = await createUser(db);
    await db.query(`insert into telegram_links (user_id, chat_id) values ($1, 777)`, [u.actor.id]);
    await db.query(`insert into notifications (user_id, kind, title) values ($1, 'deal', 'X')`, [u.actor.id]);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    for (let i = 0; i < 4; i++) await flushTelegramOutbox(db);
    expect((await db.query<{ telegram_attempts: number }>(`select telegram_attempts from notifications`)).rows[0].telegram_attempts).toBe(3);
    expect(await handleTelegramUpdate(db, { message: { chat: { id: -100, type: "group" }, text: "/start abcdefgh" } })).toBeNull();
  });

  it("webhook приймає лише правильний секрет", () => {
    expect(verifyWebhookSecret("hook-secret")).toBe(true);
    expect(verifyWebhookSecret("wrong")).toBe(false);
    expect(verifyWebhookSecret(null)).toBe(false);
  });
});
