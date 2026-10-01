import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LoopsTrdEscrow } from "../typechain-types";

export const Status = {
  None: 0n,
  Created: 1n,
  Funded: 2n,
  Paid: 3n,
  Released: 4n,
  Cancelled: 5n,
  Disputed: 6n,
  Resolved: 7n,
} as const;

export const toId = (s: string) => ethers.id(s);

/** Підпис EIP-712 дозволу на створення угоди (як це робить сервер антифроду). */
export async function signCreateDeal(
  escrow: LoopsTrdEscrow,
  signer: HardhatEthersSigner,
  p: { dealId: string; seller: string; buyer: string; amount: bigint; reviewRequired: boolean; expiry: bigint },
) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    { name: "LoopsTrdEscrow", version: "1", chainId, verifyingContract: await escrow.getAddress() },
    {
      CreateDeal: [
        { name: "dealId", type: "bytes32" },
        { name: "seller", type: "address" },
        { name: "buyer", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "reviewRequired", type: "bool" },
        { name: "expiry", type: "uint256" },
      ],
    },
    p,
  );
}
