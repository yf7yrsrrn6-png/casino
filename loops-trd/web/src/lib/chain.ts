import { keccak256, toBytes, defineChain } from "viem";
import { bscTestnet } from "viem/chains";

export const ONCHAIN_STATUS = ["None", "Created", "Funded", "Paid", "Released", "Cancelled", "Disputed", "Resolved"] as const;
export type OnchainStatus = (typeof ONCHAIN_STATUS)[number];

export const USDT_DECIMALS = 18;

/** bytes32 ідентифікатор угоди в контракті = keccak256(uuid угоди в БД). */
export function chainDealId(dealUuid: string): `0x${string}` {
  return keccak256(toBytes(`loops-trd:${dealUuid}`));
}

export function appChain(rpcUrl?: string) {
  if (!rpcUrl) return bscTestnet;
  return defineChain({ ...bscTestnet, rpcUrls: { default: { http: [rpcUrl] } } });
}
