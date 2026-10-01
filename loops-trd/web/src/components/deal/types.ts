import type { Address, Hex } from "viem";
import type { useToast } from "../ui";
import type { DEAL_STATUS } from "@/lib/format";

export interface Party {
  id: string;
  display_name: string;
  telegram: string;
  successful_deals: number;
  disputes_lost: number;
  card_holder_name?: string;
  card_last4?: string;
}

export interface Deal {
  id: string;
  chain_deal_id: Hex;
  seller_id: string;
  buyer_id: string;
  seller_wallet: string;
  buyer_wallet: string;
  amount_usdt: string;
  price_uah: string;
  total_uah: string;
  payment_method: string;
  status: keyof typeof DEAL_STATUS;
  frozen: boolean;
  release_approved: boolean;
  risk_level: "low" | "medium" | "high" | null;
  risk_score: number | null;
  release_check: string | null;
  release_check_done: boolean;
  buyer_sender_name: string | null;
  sender_name_mismatch: boolean;
  payment_deadline: string | null;
  created_at: string;
}

export interface Signal {
  code: string;
  party: string;
  layer: number;
  weight: number;
  label: string;
  explanation: string;
}

export interface DealView {
  deal: Deal;
  role: "buyer" | "seller" | "staff";
  seller: Party;
  buyer: Party;
  events: { id: number; action: string; actor_wallet: string; details?: Record<string, unknown>; tx_hash: string | null; created_at: string }[];
  dispute: null | {
    status: string;
    reason: string;
    opened_by: string;
    recommendation: string | null;
    recommended_to_buyer: string | null;
    resolution_to_buyer: string | null;
    resolution_note: string | null;
    fraud_label: string | null;
  };
  risks: { id: string; stage: string; score: number; level: string; decision: string; signals: Signal[]; created_at: string }[];
  escrow: Address | null;
  usdt: Address | null;
  graceMinutes: number;
  firstDeal: boolean;
}

export type Toast = ReturnType<typeof useToast>;

export interface ActionProps {
  v: DealView;
  refresh: (sync?: boolean) => Promise<void>;
  toast: Toast;
}

/** Кінець пільгового періоду: після нього сторонній може скасувати угоду в контракті. */
export const graceEnd = (v: DealView) =>
  v.deal.payment_deadline ? new Date(new Date(v.deal.payment_deadline).getTime() + v.graceMinutes * 60_000) : null;

export const isClosed = (s: string) => ["released", "cancelled", "resolved", "blocked"].includes(s);
