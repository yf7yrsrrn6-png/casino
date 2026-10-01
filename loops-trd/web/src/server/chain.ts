import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi } from "@/lib/abi";
import { appChain, ONCHAIN_STATUS, USDT_DECIMALS, type OnchainStatus } from "@/lib/chain";
import { contractErrorText } from "@/lib/errors";
import { env } from "./env";
import { getDb } from "./db";
import { HttpError } from "./errors";

export interface OnchainDeal {
  seller: string;
  buyer: string;
  amount: bigint;
  fundedAt: number;
  /** Фактичний дедлайн оплати (з урахуванням пауз контракту). */
  paymentDeadline: number;
  /** Коли сторонній (кіпер/продавець) зможе скасувати: дедлайн + пільговий період. */
  cancelAvailableAt: number;
  paidAt: number;
  status: OnchainStatus;
  frozen: boolean;
  reviewRequired: boolean;
  reviewApproved: boolean;
}

/** Абстракція над контрактом — у тестах підміняється фейком. */
export interface EscrowGateway {
  readonly configured: boolean;
  readonly chainId: number;
  readonly escrowAddress: string | null;
  readonly usdtAddress: string | null;
  signCreateDeal(p: {
    chainDealId: Hex;
    seller: string;
    buyer: string;
    amountUsdt: string;
    reviewRequired: boolean;
  }): Promise<{ signature: Hex; expiry: number }>;
  getDeal(chainDealId: Hex): Promise<OnchainDeal>;
  approveRelease(chainDealId: Hex): Promise<Hex>;
  freezeDeal(chainDealId: Hex, reason: string): Promise<Hex>;
  cancel(chainDealId: Hex): Promise<Hex>;
  /** Розбирає транзакцію resolveDispute і повертає розподіл. */
  readResolution(txHash: Hex, chainDealId: Hex): Promise<{ toBuyer: bigint; toSeller: bigint } | null>;
  /** Поточний час блокчейну (сек). */
  blockTime(): Promise<number>;
  latestBlock(): Promise<bigint>;
  /** id угод (bytes32), що мали події контракту в діапазоні блоків. */
  dealIdsInBlocks(fromBlock: bigint, toBlock: bigint): Promise<Hex[]>;
  /** Баланс серверного гаманця (tBNB) — для попередження про нестачу газу. */
  signerBalance(): Promise<{ address: string; balance: string }>;
}

export const toUnits = (amount: string | number) => parseUnits(String(amount), USDT_DECIMALS);

/** Перетворює помилку контракту/RPC на зрозуміле повідомлення українською. */
export function chainError(e: unknown): HttpError {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return new HttpError(409, contractErrorText(revert.data.errorName), `contract_${revert.data.errorName}`);
    }
    if (/insufficient funds/i.test(e.message)) {
      return new HttpError(503, "На серверному гаманці закінчилися тестові BNB для газу. Повідомте адміністратора.", "backend_no_gas");
    }
  }
  return new HttpError(502, "Не вдалося виконати операцію в блокчейні. Спробуйте ще раз за хвилину.", "chain_error");
}

type Lock = <T>(fn: () => Promise<T>) => Promise<T>;

class ViemEscrowGateway implements EscrowGateway {
  readonly configured = true;
  private readonly pub;
  private readonly wallet;
  private readonly account;
  readonly chainId: number;

  constructor(
    readonly escrowAddress: Address,
    readonly usdtAddress: Address,
    privateKey: Hex,
    rpcUrl: string,
    private readonly lock: Lock,
  ) {
    const chain = appChain(rpcUrl);
    this.chainId = chain.id;
    this.account = privateKeyToAccount(privateKey);
    this.pub = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 3, timeout: 20_000 }) });
    this.wallet = createWalletClient({ chain, transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }), account: this.account });
  }

  async signCreateDeal(p: Parameters<EscrowGateway["signCreateDeal"]>[0]) {
    const expiry = Math.floor(Date.now() / 1000) + 20 * 60;
    const signature = await this.account.signTypedData({
      domain: { name: "LoopsTrdEscrow", version: "1", chainId: this.chainId, verifyingContract: this.escrowAddress },
      types: {
        CreateDeal: [
          { name: "dealId", type: "bytes32" },
          { name: "seller", type: "address" },
          { name: "buyer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "reviewRequired", type: "bool" },
          { name: "expiry", type: "uint256" },
        ],
      },
      primaryType: "CreateDeal",
      message: {
        dealId: p.chainDealId,
        seller: p.seller as Address,
        buyer: p.buyer as Address,
        amount: toUnits(p.amountUsdt),
        reviewRequired: p.reviewRequired,
        expiry: BigInt(expiry),
      },
    });
    return { signature, expiry };
  }

  async getDeal(id: Hex): Promise<OnchainDeal> {
    const c = { address: this.escrowAddress, abi: escrowAbi } as const;
    const [d, deadline, cancelAt] = await Promise.all([
      this.pub.readContract({ ...c, functionName: "getDeal", args: [id] }),
      this.pub.readContract({ ...c, functionName: "effectiveDeadline", args: [id] }),
      this.pub.readContract({ ...c, functionName: "cancelAvailableAt", args: [id] }),
    ]);
    return {
      seller: d.seller.toLowerCase(),
      buyer: d.buyer.toLowerCase(),
      amount: d.amount,
      fundedAt: Number(d.fundedAt),
      paymentDeadline: Number(deadline),
      cancelAvailableAt: Number(cancelAt),
      paidAt: Number(d.paidAt),
      status: ONCHAIN_STATUS[d.status] ?? "None",
      frozen: d.frozen,
      reviewRequired: d.reviewRequired,
      reviewApproved: d.reviewApproved,
    };
  }

  /**
   * Транзакції серверного гаманця йдуть строго по черзі (блокування в БД між усіма інстансами),
   * інакше паралельні запити отримують однаковий nonce і падають.
   */
  private send(functionName: "approveRelease" | "freezeDeal" | "cancel", args: readonly unknown[]) {
    return this.lock(async () => {
      try {
        const { request } = await this.pub.simulateContract({
          address: this.escrowAddress,
          abi: escrowAbi,
          functionName,
          args: args as never,
          account: this.account,
        });
        const hash = await this.wallet.writeContract(request);
        await this.pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
        return hash;
      } catch (e) {
        throw chainError(e);
      }
    });
  }

  approveRelease(id: Hex) {
    return this.send("approveRelease", [id]);
  }
  freezeDeal(id: Hex, reason: string) {
    return this.send("freezeDeal", [id, keccak256(toBytes(reason))]);
  }
  cancel(id: Hex) {
    return this.send("cancel", [id]);
  }

  async readResolution(txHash: Hex, id: Hex) {
    const receipt = await this.pub.getTransactionReceipt({ hash: txHash });
    if (receipt.to?.toLowerCase() !== this.escrowAddress.toLowerCase() || receipt.status !== "success") return null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "DisputeResolved" && ev.args.dealId.toLowerCase() === id.toLowerCase()) {
          return { toBuyer: ev.args.toBuyer, toSeller: ev.args.toSeller };
        }
      } catch {
        /* інша подія */
      }
    }
    return null;
  }

  async blockTime() {
    const b = await this.pub.getBlock();
    return Number(b.timestamp);
  }

  latestBlock() {
    return this.pub.getBlockNumber();
  }

  async dealIdsInBlocks(fromBlock: bigint, toBlock: bigint) {
    const logs = await this.pub.getLogs({ address: this.escrowAddress, fromBlock, toBlock });
    const ids = new Set<Hex>();
    // У всіх подій контракту перший індексований параметр — dealId.
    for (const l of logs) if (l.topics[1]) ids.add(l.topics[1].toLowerCase() as Hex);
    return [...ids];
  }

  async signerBalance() {
    const b = await this.pub.getBalance({ address: this.account.address });
    return { address: this.account.address.toLowerCase(), balance: formatEther(b) };
  }
}

class UnconfiguredGateway implements EscrowGateway {
  readonly configured = false;
  readonly chainId = env().CHAIN_ID;
  readonly escrowAddress = null;
  readonly usdtAddress = null;
  private fail(): never {
    throw new HttpError(503, "Контракт не налаштовано: задайте ESCROW_ADDRESS, USDT_ADDRESS і BACKEND_SIGNER_PRIVATE_KEY", "chain_unconfigured");
  }
  signCreateDeal(): never {
    return this.fail();
  }
  getDeal(): never {
    return this.fail();
  }
  approveRelease(): never {
    return this.fail();
  }
  freezeDeal(): never {
    return this.fail();
  }
  cancel(): never {
    return this.fail();
  }
  readResolution(): never {
    return this.fail();
  }
  blockTime(): never {
    return this.fail();
  }
  latestBlock(): never {
    return this.fail();
  }
  dealIdsInBlocks(): never {
    return this.fail();
  }
  signerBalance(): never {
    return this.fail();
  }
}

/** Блокування в Postgres на час транзакції серверного гаманця (працює між serverless-інстансами). */
const dbLock: Lock = (fn) =>
  getDb().transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(814201)");
    return fn();
  });

const g = globalThis as unknown as { __loopsGateway?: EscrowGateway };

export function getGateway(): EscrowGateway {
  if (!g.__loopsGateway) {
    const e = env();
    g.__loopsGateway =
      e.ESCROW_ADDRESS && e.USDT_ADDRESS && e.BACKEND_SIGNER_PRIVATE_KEY
        ? new ViemEscrowGateway(
            e.ESCROW_ADDRESS as Address,
            e.USDT_ADDRESS as Address,
            e.BACKEND_SIGNER_PRIVATE_KEY as Hex,
            e.BSC_TESTNET_RPC_URL,
            dbLock,
          )
        : new UnconfiguredGateway();
  }
  return g.__loopsGateway;
}

export function setGateway(gw: EscrowGateway) {
  g.__loopsGateway = gw;
}
