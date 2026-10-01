"use client";

import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, type Address, type Hex } from "viem";
import { escrowAbi, mockUsdtAbi } from "@/lib/abi";
import { USDT_DECIMALS } from "@/lib/chain";

const CHAIN_ID = 97;

export class WalletError extends Error {}

/**
 * Транзакції в контракт з перевіркою гаманця, мережі й балансів.
 * Після кожної транзакції чекаємо підтвердження блоку; помилки перекладаються в errorText().
 */
export function useEscrowTx() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const pc = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const client = () => {
    if (!pc) throw new WalletError("Немає з'єднання з мережею BSC Testnet. Перевірте інтернет.");
    return pc;
  };

  const ensure = async (expectedWallet?: string) => {
    if (!address) throw new WalletError("Підключіть гаманець (кнопка «Гаманець» угорі).");
    if (expectedWallet && address.toLowerCase() !== expectedWallet.toLowerCase()) {
      throw new WalletError(`У гаманці вибрано інший акаунт. Перемкніться на ${expectedWallet.slice(0, 6)}…${expectedWallet.slice(-4)} — саме він прив'язаний до угоди.`);
    }
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
    const gas = await client().getBalance({ address });
    if (gas === BigInt(0)) throw new WalletError("На гаманці немає tBNB для оплати газу. Отримайте їх у фаусеті BNB Chain (див. «Кабінет → Тестові токени»).");
  };

  const wait = async (hash: Hex) => {
    const r = await client().waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (r.status !== "success") throw new WalletError("Контракт відхилив транзакцію. Оновіть сторінку й спробуйте ще раз.");
    return hash;
  };

  const escrow = {
    createDeal: (a: Address, args: readonly [Hex, Address, bigint, boolean, bigint, Hex]) =>
      writeContractAsync({ address: a, abi: escrowAbi, functionName: "createDeal", args, chainId: CHAIN_ID }).then(wait),
    deposit: (a: Address, id: Hex) => writeContractAsync({ address: a, abi: escrowAbi, functionName: "deposit", args: [id], chainId: CHAIN_ID }).then(wait),
    markPaid: (a: Address, id: Hex) => writeContractAsync({ address: a, abi: escrowAbi, functionName: "markPaid", args: [id], chainId: CHAIN_ID }).then(wait),
    confirmRelease: (a: Address, id: Hex) =>
      writeContractAsync({ address: a, abi: escrowAbi, functionName: "confirmRelease", args: [id], chainId: CHAIN_ID }).then(wait),
    cancel: (a: Address, id: Hex) => writeContractAsync({ address: a, abi: escrowAbi, functionName: "cancel", args: [id], chainId: CHAIN_ID }).then(wait),
    openDispute: (a: Address, id: Hex) =>
      writeContractAsync({ address: a, abi: escrowAbi, functionName: "openDispute", args: [id], chainId: CHAIN_ID }).then(wait),
    resolveDispute: (a: Address, id: Hex, toBuyer: bigint) =>
      writeContractAsync({ address: a, abi: escrowAbi, functionName: "resolveDispute", args: [id, toBuyer], chainId: CHAIN_ID }).then(wait),
    unfreezeDeal: (a: Address, id: Hex) =>
      writeContractAsync({ address: a, abi: escrowAbi, functionName: "unfreezeDeal", args: [id], chainId: CHAIN_ID }).then(wait),
    status: async (a: Address, id: Hex) => (await client().readContract({ address: a, abi: escrowAbi, functionName: "getDeal", args: [id] })).status,
  };

  const usdt = {
    approve: (t: Address, spender: Address, amount: bigint) =>
      writeContractAsync({ address: t, abi: mockUsdtAbi, functionName: "approve", args: [spender, amount], chainId: CHAIN_ID }).then(wait),
    faucet: (t: Address) => writeContractAsync({ address: t, abi: mockUsdtAbi, functionName: "faucet", args: [], chainId: CHAIN_ID }).then(wait),
    allowance: (t: Address, owner: Address, spender: Address) =>
      client().readContract({ address: t, abi: mockUsdtAbi, functionName: "allowance", args: [owner, spender] }),
    /** Перевірка балансу перед депозитом — зрозуміла помилка замість відхиленої транзакції. */
    requireBalance: async (t: Address, owner: Address, amount: bigint) => {
      const bal = await client().readContract({ address: t, abi: mockUsdtAbi, functionName: "balanceOf", args: [owner] });
      if (bal < amount) {
        throw new WalletError(
          `Недостатньо mUSDT: на гаманці ${formatUnits(bal, USDT_DECIMALS)}, потрібно ${formatUnits(amount, USDT_DECIMALS)}. Отримайте тестові токени в кабінеті.`,
        );
      }
    },
  };

  return { address, ensure, escrow, usdt };
}
