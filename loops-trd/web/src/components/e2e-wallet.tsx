"use client";

import { useEffect } from "react";
import { useConnect } from "wagmi";

/**
 * ЛИШЕ ДЛЯ E2E-ТЕСТІВ (збірка з NEXT_PUBLIC_E2E=1; у звичайній збірці код вирізається).
 * Дає Playwright підключити тестовий гаманець (window.ethereum) без модального вікна Reown,
 * яке потребує зовнішніх серверів. На безпеку не впливає: сервер так само перевіряє підписи гаманця.
 */
export function E2EWalletBridge() {
  const { connectAsync, connectors } = useConnect();
  useEffect(() => {
    const w = window as unknown as { __loopsE2EConnect?: () => Promise<unknown>; __loopsE2EConnectors?: () => string[] };
    w.__loopsE2EConnectors = () => connectors.map((c) => `${c.id}:${c.type}`);
    w.__loopsE2EConnect = async () => {
      const c = connectors.find((x) => x.id === "injected") ?? connectors.find((x) => x.type === "injected");
      if (!c) throw new Error("injected connector not found");
      try {
        return await connectAsync({ connector: c, chainId: 97 });
      } catch (e) {
        // Після переходу між сторінками wagmi сам відновлює підключення — це не помилка.
        if ((e as Error).name === "ConnectorAlreadyConnectedError") return { alreadyConnected: true };
        throw e;
      }
    };
  }, [connectAsync, connectors]);
  return null;
}
