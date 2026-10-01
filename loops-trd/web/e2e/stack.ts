/**
 * Тестовий стенд без моків: Postgres (PGlite через wire-протокол) з міграціями Supabase,
 * локальний вузол Hardhat з chainId 97 + задеплоєні контракти, справжній `next start`.
 * Використовується API-сценарієм (e2e/run.ts) і браузерними тестами Playwright (e2e/ui).
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPublicClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ROOT = path.join(__dirname, "..");
export const CONTRACTS = path.join(ROOT, "..", "contracts");
export const RPC = "http://127.0.0.1:8545";
export const CRON_SECRET = "e2e-cron-secret";

// Стандартні тестові ключі Hardhat (лише локально!)
export const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
  admin: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  backend: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex,
};

export const chain = defineChain({ id: 97, name: "local-97", nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
export const pub = createPublicClient({ chain, transport: http(RPC) });

export interface Stack {
  base: string;
  escrow: Address;
  usdt: Address;
  stop: () => Promise<void>;
}

const procs: ChildProcess[] = [];

function run(cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; tag: string; wait?: boolean }) {
  // detached → окрема група процесів, щоб зупинити і дочірні процеси npx.
  const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"], detached: !opts.wait });
  const log = fs.createWriteStream(path.join(ROOT, "e2e", `${opts.tag}.log`));
  p.stdout.pipe(log);
  p.stderr.pipe(log);
  if (!opts.wait) procs.push(p);
  return new Promise<number>((resolve) => (opts.wait ? p.on("exit", (c) => resolve(c ?? 1)) : resolve(0)));
}

export async function waitFor(fn: () => Promise<boolean>, what: string, ms = 180_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Таймаут: ${what}`);
}

export function killAll() {
  for (const p of procs.splice(0)) {
    try {
      if (p.pid) process.kill(-p.pid, "SIGTERM");
    } catch {
      p.kill("SIGTERM");
    }
  }
}

export async function startStack(opts: { port: number; pgPort?: number; build?: boolean; extraEnv?: Record<string, string> }): Promise<Stack> {
  const pgPort = opts.pgPort ?? 54329;
  const base = `http://localhost:${opts.port}`;

  const db = new PGlite();
  const migDir = path.join(ROOT, "supabase", "migrations");
  for (const f of fs.readdirSync(migDir).sort()) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  const pg = new PGLiteSocketServer({ db, port: pgPort, host: "127.0.0.1", maxConnections: 20 });
  await pg.start();

  const hhEnv = { HARDHAT_CHAIN_ID: "97", USE_SOLCJS: process.env.USE_SOLCJS ?? "true" };
  await run("npx", ["hardhat", "node", "--port", "8545"], { cwd: CONTRACTS, env: hhEnv, tag: "hardhat" });
  await waitFor(async () => (await pub.getChainId()) === 97, "hardhat node");
  const adminAddr = privateKeyToAccount(KEYS.admin).address;
  const code = await run("npx", ["hardhat", "run", "scripts/deploy.ts", "--network", "localhost"], {
    cwd: CONTRACTS,
    env: { ...hhEnv, ADMIN_ADDRESS: adminAddr, BACKEND_SIGNER_ADDRESS: privateKeyToAccount(KEYS.backend).address },
    tag: "deploy",
    wait: true,
  });
  if (code !== 0) throw new Error("Деплой не вдався — див. e2e/deploy.log");
  const dep = JSON.parse(fs.readFileSync(path.join(CONTRACTS, "deployments", "localhost.json"), "utf8"));
  // Multicall3 за канонічною адресою (у справжніх мережах уже є; wagmi/AppKit групують читання через нього).
  const mc = JSON.parse(fs.readFileSync(path.join(CONTRACTS, "artifacts", "contracts", "test", "Multicall3.sol", "Multicall3.json"), "utf8"));
  await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "hardhat_setCode", params: ["0xcA11bde05977b3631167028862bE2a173976CA11", mc.deployedBytecode] }),
  });

  const appEnv: Record<string, string> = {
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`,
    DATABASE_SSL: "false",
    DATABASE_POOL_MAX: "4",
    SESSION_SECRET: "e2e-session-secret-e2e-session-secret-123",
    APP_DOMAIN: `localhost:${opts.port}`,
    APP_URL: base,
    CHAIN_ID: "97",
    BSC_TESTNET_RPC_URL: RPC,
    ESCROW_ADDRESS: dep.escrow,
    USDT_ADDRESS: dep.usdt,
    BACKEND_SIGNER_PRIVATE_KEY: KEYS.backend,
    BOOTSTRAP_ADMIN_WALLET: adminAddr.toLowerCase(),
    CRON_SECRET,
    ...opts.extraEnv,
  };
  if (opts.build) {
    const b = await run("npx", ["next", "build", "--webpack"], { cwd: ROOT, env: appEnv, tag: "build", wait: true });
    if (b !== 0) throw new Error("Збірка не вдалася — див. e2e/build.log");
  }
  await run("npx", ["next", "start", "-p", String(opts.port)], { cwd: ROOT, tag: "next", env: appEnv });
  await waitFor(async () => (await fetch(`${base}/api/config`)).ok, "next start");

  return {
    base,
    escrow: dep.escrow,
    usdt: dep.usdt,
    stop: async () => {
      killAll();
      await pg.stop();
    },
  };
}
