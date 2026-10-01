import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET має бути ≥ 32 символів"),
  APP_DOMAIN: z.string().default("localhost:3000"),
  APP_URL: z.string().default("http://localhost:3000"),
  CHAIN_ID: z.coerce.number().default(97),
  BSC_TESTNET_RPC_URL: z.string().default("https://data-seed-prebsc-1-s1.bnbchain.org:8545"),
  ESCROW_ADDRESS: z.string().optional(),
  USDT_ADDRESS: z.string().optional(),
  BACKEND_SIGNER_PRIVATE_KEY: z.string().optional(),
  BOOTSTRAP_ADMIN_WALLET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  AMLBOT_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Невірні змінні середовища: " + parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    }
    if (parsed.data.CHAIN_ID === 56 || parsed.data.CHAIN_ID === 1) {
      throw new Error("Mainnet заборонено: Loops Trd працює лише в тестовій мережі.");
    }
    cached = parsed.data;
  }
  return cached;
}

/** Для тестів. */
export function resetEnvCache() {
  cached = null;
}
