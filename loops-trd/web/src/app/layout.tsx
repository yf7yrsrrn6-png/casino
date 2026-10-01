import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell";

export const metadata: Metadata = {
  title: { default: "Loops Trd — P2P USDT ⇄ UAH", template: "%s · Loops Trd" },
  description: "Закрита P2P-площадка обміну USDT на гривню між друзями. Ескроу-контракт, антифрод, вхід лише за запрошенням.",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#07080c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookies = (await headers()).get("cookie");
  return (
    <html lang="uk" className="dark">
      <body>
        <Providers cookies={cookies}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
