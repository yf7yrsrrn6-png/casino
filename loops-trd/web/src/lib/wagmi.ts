import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bscTestnet } from "@reown/appkit/networks";

/** Project ID з https://dashboard.reown.com (див. README). */
export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

// Лише тестова мережа.
export const networks = [bscTestnet] as [typeof bscTestnet];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: projectId || "missing-project-id",
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

// ID гаманців у каталозі WalletConnect — показуємо першими.
export const METAMASK_ID = "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96";
export const TRUST_WALLET_ID = "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0";
