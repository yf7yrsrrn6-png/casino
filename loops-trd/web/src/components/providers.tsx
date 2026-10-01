"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { bscTestnet } from "@reown/appkit/networks";
import { projectId, wagmiAdapter, METAMASK_ID, TRUST_WALLET_ID } from "@/lib/wagmi";

if (typeof window !== "undefined") {
  createAppKit({
    adapters: [wagmiAdapter],
    networks: [bscTestnet],
    defaultNetwork: bscTestnet,
    projectId: projectId || "missing-project-id",
    metadata: {
      name: "Loops Trd",
      description: "Закрита P2P-площадка USDT ⇄ UAH",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.svg`],
    },
    featuredWalletIds: [TRUST_WALLET_ID, METAMASK_ID],
    features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false, history: false },
    themeMode: "dark",
    themeVariables: { "--w3m-accent": "#8b6cff", "--w3m-border-radius-master": "2px", "--w3m-font-family": "Inter, system-ui, sans-serif" },
    allowUnsupportedChain: false,
  });
}

export function Providers({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true, retry: 1 } } }),
  );
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
