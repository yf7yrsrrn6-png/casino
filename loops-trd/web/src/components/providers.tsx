"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { bscTestnet, projectId, wagmiAdapter, METAMASK_ID, TRUST_WALLET_ID } from "@/lib/wagmi";
import { E2EWalletBridge } from "./e2e-wallet";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Ініціалізація на рівні модуля (і на сервері під час SSR) — інакше useAppKit падає при рендері.
createAppKit({
  adapters: [wagmiAdapter],
  networks: [bscTestnet],
  defaultNetwork: bscTestnet,
  projectId: projectId || "missing-project-id",
  metadata: {
    name: "Loops Trd",
    description: "Закрита P2P-площадка USDT ⇄ UAH",
    url: appUrl,
    icons: [`${appUrl}/icon.svg`],
  },
  featuredWalletIds: [TRUST_WALLET_ID, METAMASK_ID],
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false, history: false },
  themeMode: "dark",
  themeVariables: { "--w3m-accent": "#8b6cff", "--w3m-border-radius-master": "2px", "--w3m-font-family": "Inter, system-ui, sans-serif" },
  allowUnsupportedChain: false,
});

export function Providers({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const [qc] = useState(
    () => new QueryClient({
        defaultOptions: {
          // Повільний інтернет: кілька повторів з паузою, оновлення при поверненні мережі.
          queries: { staleTime: 5_000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000) },
          mutations: { retry: 0 },
        },
      }),
  );
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={qc}>
        {process.env.NEXT_PUBLIC_E2E === "1" && <E2EWalletBridge />}
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
