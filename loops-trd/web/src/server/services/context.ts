import { getDb, type Db } from "../db";
import { getGateway, type EscrowGateway } from "../chain";
import { defaultAmlProvider, HeuristicIpIntel, type AmlProvider, type IpIntelProvider } from "../antifraud/providers";
import { env } from "../env";

export interface Ctx {
  db: Db;
  chain: EscrowGateway;
  aml: AmlProvider;
  ipIntel: IpIntelProvider;
  now: () => Date;
  domain: string;
  chainId: number;
  bootstrapAdminWallet: string | null;
}

export function defaultCtx(): Ctx {
  const e = env();
  return {
    db: getDb(),
    chain: getGateway(),
    aml: defaultAmlProvider(),
    ipIntel: new HeuristicIpIntel(),
    now: () => new Date(),
    domain: e.APP_DOMAIN,
    chainId: e.CHAIN_ID,
    bootstrapAdminWallet: e.BOOTSTRAP_ADMIN_WALLET?.toLowerCase() ?? null,
  };
}
