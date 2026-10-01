"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useChainId, useSignMessage, useSwitchChain } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { Alert, Button, Card, Field, Input, Logo } from "@/components/ui";
import { api, ApiError, errorText } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { projectId } from "@/lib/wagmi";
import type { Actor } from "@/components/session";

const CHAIN_ID = 97;

export default function LoginPage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [needInvite, setNeedInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const signIn = async () => {
    if (!address) return;
    setErr(null);
    setBusy(true);
    try {
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce", { body: { address } });
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Вхід до Loops Trd. Підпис не створює транзакцію і не витрачає газ.",
        uri: window.location.origin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60_000),
      });
      const signature = await signMessageAsync({ message });
      const { actor } = await api<{ actor: Actor }>("/api/auth/verify", { body: { message, signature, inviteCode: invite.trim() || undefined } });
      await qc.invalidateQueries();
      router.replace(!actor.profile_completed && actor.role === "member" ? "/onboarding" : actor.status === "approved" ? "/market" : "/account");
    } catch (e) {
      if (e instanceof ApiError && e.code === "invite_required") setNeedInvite(true);
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-12">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <Card>
        <h1 className="text-xl font-semibold">Вхід</h1>
        <p className="mt-1 text-sm text-ink-3">Підключіть Trust Wallet або MetaMask і підпишіть повідомлення — так ви доводите володіння гаманцем.</p>

        {!projectId && (
          <div className="mt-4">
            <Alert tone="warn" title="Не задано NEXT_PUBLIC_REOWN_PROJECT_ID">
              Підключення через WalletConnect не працюватиме. Див. README → «Reown Project ID».
            </Alert>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <Field label="Інвайт-код" hint="Потрібен лише для першого входу з новим гаманцем." error={needInvite && !invite ? "Для нового гаманця потрібен інвайт-код від адміністратора" : null}>
            <Input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="LT-XXXXXXXXXXXX" autoComplete="off" spellCheck={false} />
          </Field>

          <div className="rounded-xl border border-line bg-surface-2 p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="text-ink-3 text-xs">Гаманець</div>
              <div className="font-mono">{isConnected ? shortAddr(address) : "не підключено"}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => open()}>
              {isConnected ? "Змінити" : "Підключити"}
            </Button>
          </div>

          {isConnected && chainId !== CHAIN_ID && <Alert tone="warn">Перемкніть гаманець на BNB Smart Chain Testnet (chainId 97).</Alert>}
          {err && <Alert tone="bad">{err}</Alert>}

          <Button className="w-full" size="lg" disabled={!isConnected} loading={busy} onClick={signIn}>
            Підписати та увійти
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-ink-3 leading-relaxed">
        Ми ніколи не просимо seed-фразу чи приватний ключ.
        <br />
        Підпис входу не дає доступу до ваших коштів.
        <br />
        <a href="/help" className="text-brand-2 hover:underline">
          Як пройти верифікацію і як проходить угода →
        </a>
      </p>
    </div>
  );
}
