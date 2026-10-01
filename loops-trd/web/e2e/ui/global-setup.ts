import fs from "fs";
import path from "path";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount } from "viem/accounts";
import { KEYS, RPC, startStack } from "../stack";

export const STATE = path.join(__dirname, "..", ".ui-state.json");
const PORT = 3200;

/** Піднімає стенд, створює адміна та інвайти; повертає функцію зупинки (teardown). */
export default async function globalSetup() {
  const stack = await startStack({
    port: PORT,
    pgPort: 54339,
    build: process.env.E2E_SKIP_BUILD !== "1",
    extraEnv: { NEXT_PUBLIC_E2E: "1", NEXT_PUBLIC_BSC_RPC_URL: RPC, CSP_EXTRA_CONNECT: RPC },
  });
  const base = stack.base;
  const admin = privateKeyToAccount(KEYS.admin);
  let cookie = "";
  const call = async <T>(p: string, body?: unknown, method?: string): Promise<T> => {
    const res = await fetch(base + p, {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", cookie },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set?.startsWith("lt_session=")) cookie = set.split(";")[0];
    const data = await res.json();
    if (!res.ok) throw new Error(`${p}: ${JSON.stringify(data)}`);
    return data as T;
  };
  const { nonce } = await call<{ nonce: string }>("/api/auth/nonce", { address: admin.address });
  const message = createSiweMessage({ address: admin.address, chainId: 97, domain: `localhost:${PORT}`, nonce, uri: base, version: "1", issuedAt: new Date() });
  await call("/api/auth/verify", { message, signature: await admin.signMessage({ message }) });

  // Для UI-тестів пороги антифроду вищі: швидкі автоматичні дії нових акаунтів інакше заморожуються.
  const ov = await call<{ config: Record<string, unknown> }>("/api/admin/antifraud");
  const cfg = { ...ov.config, thresholds: { medium: 60, high: 95 } };
  const ch = await call<{ nonce: string; message: string }>("/api/challenge", { action: "antifraud.config", payload: cfg });
  await call("/api/admin/antifraud", { input: cfg, signed: { nonce: ch.nonce, signature: await admin.signMessage({ message: ch.message }) } }, "PUT");

  const invites: string[] = [];
  for (let i = 0; i < 4; i++) invites.push((await call<{ code: string }>("/api/admin/invites", { days: 2 })).code);
  // Розблоковані акаунти вузла Hardhat: [0] деплоєр, [1] адмін, [2] сервер, [3..] учасники.
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_accounts", params: [] }) });
  const accounts = ((await res.json()) as { result: string[] }).result;
  fs.writeFileSync(STATE, JSON.stringify({ base, escrow: stack.escrow, usdt: stack.usdt, adminCookie: cookie, invites, accounts }, null, 2));
  return async () => {
    await stack.stop();
  };
}
