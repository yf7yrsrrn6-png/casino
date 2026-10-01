"use client";

import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import type { Abi, Address, Hex } from "viem";

const CHAIN_ID = 97;

/** Транзакції в контракт з перевіркою мережі та гаманця. Після кожної — чекаємо підтвердження блоку. */
export function useEscrowTx() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const pc = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const ensure = async (expectedWallet?: string) => {
    if (!address) throw new Error("Підключіть гаманець");
    if (expectedWallet && address.toLowerCase() !== expectedWallet.toLowerCase()) {
      throw new Error(`Підключіть гаманець ${expectedWallet.slice(0, 6)}…${expectedWallet.slice(-4)} — саме він прив'язаний до угоди`);
    }
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
  };

  const write = async (p: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) => {
    if (!pc) throw new Error("Немає з'єднання з BSC Testnet");
    const hash = (await writeContractAsync({ ...p, chainId: CHAIN_ID } as never)) as Hex;
    const r = await pc.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("Транзакцію відхилено контрактом");
    return hash;
  };

  const read = async <T,>(p: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) => {
    if (!pc) throw new Error("Немає з'єднання з BSC Testnet");
    return (await pc.readContract(p as never)) as T;
  };

  return { address, ensure, write, read };
}
