import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  toBytes,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi } from "@/lib/abi";
import { appChain, ONCHAIN_STATUS, USDT_DECIMALS, type OnchainStatus } from "@/lib/chain";
import { env } from "./env";

export interface OnchainDeal {
  seller: string;
  buyer: string;
  amount: bigint;
  fundedAt: number;
  paymentDeadline: number;
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
}

export const toUnits = (amount: string | number) => parseUnits(String(amount), USDT_DECIMALS);

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
  ) {
    const chain = appChain(rpcUrl);
    this.chainId = chain.id;
    this.account = privateKeyToAccount(privateKey);
    this.pub = createPublicClient({ chain, transport: http(rpcUrl) });
    this.wallet = createWalletClient({ chain, transport: http(rpcUrl), account: this.account });
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
    const d = await this.pub.readContract({ address: this.escrowAddress, abi: escrowAbi, functionName: "getDeal", args: [id] });
    return {
      seller: d.seller.toLowerCase(),
      buyer: d.buyer.toLowerCase(),
      amount: d.amount,
      fundedAt: Number(d.fundedAt),
      paymentDeadline: Number(d.paymentDeadline),
      paidAt: Number(d.paidAt),
      status: ONCHAIN_STATUS[d.status] ?? "None",
      frozen: d.frozen,
      reviewRequired: d.reviewRequired,
      reviewApproved: d.reviewApproved,
    };
  }

  private async send(functionName: "approveRelease" | "freezeDeal" | "cancel", args: readonly unknown[]) {
    const { request } = await this.pub.simulateContract({
      address: this.escrowAddress,
      abi: escrowAbi,
      functionName,
      args: args as never,
      account: this.account,
    });
    const hash = await this.wallet.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
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
}

class UnconfiguredGateway implements EscrowGateway {
  readonly configured = false;
  readonly chainId = env().CHAIN_ID;
  readonly escrowAddress = null;
  readonly usdtAddress = null;
  private fail(): never {
    throw new Error("Контракт не налаштовано: задайте ESCROW_ADDRESS, USDT_ADDRESS і BACKEND_SIGNER_PRIVATE_KEY");
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
}

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
          )
        : new UnconfiguredGateway();
  }
  return g.__loopsGateway;
}

export function setGateway(gw: EscrowGateway) {
  g.__loopsGateway = gw;
}
