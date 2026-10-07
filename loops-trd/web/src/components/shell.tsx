"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { api } from "@/lib/api";
import { shortAddr, USER_STATUS } from "@/lib/format";
import { Alert, Badge, Button, Logo, OfflineBanner, Spinner, cx } from "./ui";
import { isAdminRole, isStaffRole, useMe, type Actor } from "./session";

const CHAIN_ID = 97;

function NavLink({ href, children, mobile }: { href: string; children: ReactNode; mobile?: boolean }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(href + "/")) || path === href;
  if (mobile) {
    return (
      <Link href={href} className={cx("flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-ink" : "text-ink-3")}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} className={cx("h-9 px-3 inline-flex items-center rounded-lg text-[13.5px] font-medium whitespace-nowrap transition", active ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink hover:bg-surface-2")}>
      {children}
    </Link>
  );
}

export function WalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  if (isConnected && chainId !== CHAIN_ID) {
    return (
      <Button size="sm" variant="danger" onClick={() => switchChain({ chainId: CHAIN_ID })}>
        Мережа BSC Testnet
      </Button>
    );
  }
  return (
    <Button size="sm" variant="secondary" onClick={() => open()}>
      <span className={cx("h-2 w-2 rounded-full", isConnected ? "bg-ok" : "bg-ink-3")} />
      {isConnected ? shortAddr(address) : "Гаманець"}
    </Button>
  );
}

function Bell() {
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number }>("/api/notifications"), refetchInterval: 20_000 });
  return (
    <Link href="/notifications" className="relative h-10 w-10 inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Сповіщення">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {!!q.data?.unread && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-bad text-[10px] font-bold text-white flex items-center justify-center">
          {q.data.unread > 9 ? "9+" : q.data.unread}
        </span>
      )}
    </Link>
  );
}

const Icon = {
  market: <path d="M3 3v18h18M7 14l4-4 4 4 5-5" />,
  deals: <path d="M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />,
  offers: <path d="M12 5v14M5 12h14" />,
  user: <path d="M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
};
const Ico = ({ d }: { d: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const actor = me.data?.actor;
  const qc = useQueryClient();
  const router = useRouter();
  const approved = actor?.status === "approved";

  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    await qc.invalidateQueries();
    router.push("/");
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
          <Link href={approved ? "/market" : "/"} className="shrink-0">
            <Logo />
          </Link>
          {approved && (
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <NavLink href="/market">Ринок</NavLink>
              <NavLink href="/deals">Мої угоди</NavLink>
              <NavLink href="/offers">Оголошення</NavLink>
              {isStaffRole(actor) && <NavLink href="/mod">Модерація</NavLink>}
              {isAdminRole(actor) && <NavLink href="/admin">Адмінка</NavLink>}
              {!isStaffRole(actor) && <NavLink href="/help">Довідка</NavLink>}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {actor && <Bell />}
            <WalletButton />
            {actor ? (
              <>
                <Link href="/account" className="hidden sm:inline-flex h-9 px-2.5 items-center gap-2 rounded-lg hover:bg-surface-2 text-[13px] text-ink-2 whitespace-nowrap">
                  <span className="max-w-[8rem] truncate">{actor.display_name ?? shortAddr(actor.wallet_address)}</span>
                  {actor.role !== "member" && <Badge tone="brand">{actor.role === "admin" ? "адмін" : "мод"}</Badge>}
                </Link>
                <span className="hidden sm:block">
                  <Button size="sm" variant="ghost" onClick={logout}>
                    Вийти
                  </Button>
                </span>
              </>
            ) : (
              <Link href="/login">
                <Button size="sm">Увійти</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <OfflineBanner />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5 sm:py-8 pb-24 md:pb-10">{children}</main>

      {approved && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl flex pb-[env(safe-area-inset-bottom)]">
          <NavLink href="/market" mobile>
            <Ico d={Icon.market} />
            Ринок
          </NavLink>
          <NavLink href="/deals" mobile>
            <Ico d={Icon.deals} />
            Угоди
          </NavLink>
          <NavLink href="/offers" mobile>
            <Ico d={Icon.offers} />
            Оголошення
          </NavLink>
          {isStaffRole(actor) && (
            <NavLink href={isAdminRole(actor) ? "/admin" : "/mod"} mobile>
              <Ico d={Icon.shield} />
              {isAdminRole(actor) ? "Адмін" : "Модерація"}
            </NavLink>
          )}
          <NavLink href="/account" mobile>
            <Ico d={Icon.user} />
            Кабінет
          </NavLink>
        </nav>
      )}

      <footer className="border-t border-line/60 py-6 pb-24 md:pb-6 text-center text-xs text-ink-3 px-4">
        Loops Trd · закрита P2P-площадка · лише BNB Smart Chain Testnet · тестові кошти ·{" "}
        <Link href="/help" className="text-ink-2 hover:text-ink underline-offset-2 hover:underline">
          Як це працює
        </Link>
      </footer>
    </div>
  );
}

/** Охорона сторінок на клієнті. Справжня перевірка прав — на сервері та в RLS. */
export function Guard({ need = "approved", roles, children }: { need?: "auth" | "approved"; roles?: Actor["role"][]; children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const actor = me.data?.actor;
  useEffect(() => {
    if (me.isSuccess && !actor) router.replace("/login");
    // Анкету заповнюють учасники; адміністратор, створений через BOOTSTRAP_ADMIN_WALLET, може працювати без неї.
    else if (actor && need === "approved" && actor.role === "member" && !actor.profile_completed) router.replace("/onboarding");
  }, [me.isSuccess, actor, router, need]);

  if (me.isLoading || !actor) {
    return (
      <div className="py-20 flex justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (need === "approved" && actor.status !== "approved") {
    const st = USER_STATUS[actor.status];
    return (
      <div className="max-w-lg mx-auto py-10 space-y-4">
        <Alert tone={st.tone === "bad" ? "bad" : "warn"} title={`Статус: ${st.label}`}>
          {actor.status === "pending"
            ? "Адміністратор перевіряє вашу заявку. Після схвалення відкриються ринок і угоди."
            : "Зверніться до адміністратора. Деталі — у кабінеті."}
        </Alert>
        <Link href="/account">
          <Button variant="secondary">Перейти в кабінет</Button>
        </Link>
      </div>
    );
  }
  if (roles && !roles.includes(actor.role)) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <Alert tone="bad" title="Немає доступу">Ця сторінка доступна лише персоналу.</Alert>
      </div>
    );
  }
  return <>{children}</>;
}
