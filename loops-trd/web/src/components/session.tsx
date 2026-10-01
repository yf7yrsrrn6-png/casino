"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "@/lib/api";

export interface Actor {
  id: string;
  wallet_address: string;
  role: "member" | "moderator" | "admin";
  status: "pending" | "approved" | "rejected" | "blocked";
  profile_completed: boolean;
  display_name: string | null;
}

export interface MeResponse {
  actor: Actor | null;
  profile?: Record<string, unknown> & {
    display_name: string | null;
    telegram: string | null;
    card_holder_name: string | null;
    card_last4: string | null;
    status: Actor["status"];
    status_reason: string | null;
    profile_completed: boolean;
    wallet_address: string;
    role: Actor["role"];
    successful_deals: number;
    disputes_count: number;
    disputes_lost: number;
    created_at: string;
  };
  requests?: Record<string, unknown>[];
  limits?: { single: number; daily: number; usedToday: number; tier: { minDeals: number }; nextTier: { minDeals: number; single: number; daily: number } | null };
  rating?: number | null;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/api/me"), staleTime: 15_000 });
}

export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["me"] });
}

export const isStaffRole = (a?: Actor | null) => !!a && a.status === "approved" && (a.role === "admin" || a.role === "moderator");
export const isAdminRole = (a?: Actor | null) => !!a && a.status === "approved" && a.role === "admin";

/** Підпис критичної дії гаманцем: сервер фіксує дію+дані в одноразовому nonce, гаманець підписує текст. */
export function useSignAction() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const me = useMe();
  return async (action: string, payload: unknown) => {
    const wallet = me.data?.actor?.wallet_address;
    if (!address) throw new Error("Підключіть гаманець для підпису");
    if (wallet && address.toLowerCase() !== wallet) throw new Error(`Підключіть гаманець акаунта ${wallet.slice(0, 6)}…${wallet.slice(-4)}`);
    const ch = await api<{ nonce: string; message: string }>("/api/challenge", { body: { action, payload } });
    const signature = await signMessageAsync({ message: ch.message });
    return { nonce: ch.nonce, signature };
  };
}
