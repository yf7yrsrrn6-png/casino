import fs from "fs";
import path from "path";
import { expect, type Browser, type Page } from "@playwright/test";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KEYS, RPC, chain } from "../stack";

export interface UiState {
  base: string;
  escrow: string;
  usdt: string;
  adminCookie: string;
  invites: string[];
  accounts: string[];
}

export const state = (): UiState => JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".ui-state.json"), "utf8"));

/**
 * Тестовий гаманець у сторінці: EIP-1193 провайдер, який підписує й надсилає транзакції через
 * розблоковані акаунти локального вузла Hardhat (справжні підписи й транзакції, без моків контракту).
 */
function walletScript(account: string, rpc: string) {
  return `(() => {
    const account = ${JSON.stringify(account)};
    const rpc = ${JSON.stringify(rpc)};
    let id = 0;
    const listeners = {};
    const send = async (method, params) => {
      const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params || [] }) });
      const j = await res.json();
      if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
      return j.result;
    };
    const provider = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        switch (method) {
          case "eth_requestAccounts": case "eth_accounts": return [account];
          case "eth_chainId": return "0x61";
          case "net_version": return "97";
          case "wallet_switchEthereumChain": case "wallet_addEthereumChain": case "wallet_watchAsset": return null;
          case "wallet_requestPermissions": case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
          case "wallet_revokePermissions": return null;
          default: return send(method, params);
        }
      },
      on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    };
    window.ethereum = provider;
  })();`;
}

export async function openAs(browser: Browser, account: string): Promise<Page> {
  // Окремий IP для кожного учасника: інакше антифрод справедливо бачить «спільний IP» (самоторгівля).
  const ip = `198.51.100.${parseInt(account.slice(-2), 16) % 250}`;
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  await ctx.addInitScript(walletScript(account, RPC));
  // Однаковий headless Chromium дає однаковий відбиток FingerprintJS — «спільний пристрій» для антифроду.
  // Імітуємо різні пристрої учасників.
  await ctx.route("**/api/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-device-id": `e2e-device-${account.slice(2, 14)}` } }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror ${account.slice(0, 8)}]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to (load|fetch)|Cross-Origin|TUNNEL|web3modal|reown|walletconnect/i.test(m.text())) {
      console.log(`[console ${account.slice(0, 8)}]`, m.text().slice(0, 300));
    }
  });
  await page.goto("/");
  await connect(page);
  return page;
}

export async function connect(page: Page) {
  await page.waitForFunction(() => typeof (window as unknown as { __loopsE2EConnect?: unknown }).__loopsE2EConnect === "function");
  await page.evaluate(() => (window as unknown as { __loopsE2EConnect: () => Promise<unknown> }).__loopsE2EConnect());
}

/** Перехід на сторінку + гарантоване підключення тестового гаманця. */
export async function go(page: Page, path: string) {
  await page.goto(path);
  await connect(page);
  await expect(page.locator("header").getByText(/0x[0-9a-fA-F]{4}…/).first()).toBeVisible();
}

/** Повідомлення-тост (role=alert) з очікуваним текстом; при помилці видно фактичний текст. */
export async function expectToast(page: Page, text: string | RegExp, timeout = 90_000) {
  try {
    await expect(page.getByRole("alert").filter({ hasText: text }).first()).toBeVisible({ timeout });
  } catch (e) {
    console.log("Тости на сторінці:", await page.getByRole("alert").allTextContents());
    throw e;
  }
}

export async function login(page: Page, invite?: string) {
  await page.goto("/login");
  await connect(page);
  if (invite) await page.getByLabel("Інвайт-код").fill(invite);
  await page.getByRole("button", { name: "Підписати та увійти" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** Адмін (через API з ключем Hardhat): дії з обов'язковим підписом гаманця. */
export async function adminCall<T>(p: string, body?: unknown, method?: string): Promise<T> {
  const s = state();
  const res = await fetch(s.base + p, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", cookie: s.adminCookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${p}: ${JSON.stringify(data)}`);
  return data as T;
}

export async function adminApprove(wallet: string) {
  const admin = privateKeyToAccount(KEYS.admin);
  const { users } = await adminCall<{ users: { id: string; wallet_address: string }[] }>("/api/admin/users");
  const u = users.find((x) => x.wallet_address === wallet.toLowerCase());
  if (!u) throw new Error(`Користувача ${wallet} не знайдено`);
  const input = { action: "approve" };
  const ch = await adminCall<{ nonce: string; message: string }>("/api/challenge", { action: "user.approve", payload: { userId: u.id, ...input } });
  await adminCall(`/api/admin/users/${u.id}`, { input, signed: { nonce: ch.nonce, signature: await admin.signMessage({ message: ch.message }) } });
}

/** Газ учасникам — з акаунта деплоєра. */
export async function fund(address: string) {
  const w = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(KEYS.deployer) });
  await w.sendTransaction({ to: address as `0x${string}`, value: BigInt(10) ** BigInt(19), chain });
}

export async function expectStatus(page: Page, text: string | RegExp) {
  await expect(page.locator("header + div, main").getByText(text).first()).toBeVisible({ timeout: 60_000 });
}
