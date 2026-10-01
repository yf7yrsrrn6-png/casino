import type { Db } from "../db";
import type { RequestMeta } from "../auth";
import { evaluate, type RiskResult, type Stage } from "./engine";
import { gatherParty, linksBetween, loadConfig, saveAssessment } from "./repository";
import type { AmlProvider, IpIntelProvider } from "./providers";

export * from "./engine";
export * from "./config";
export * from "./limits";
export * from "./providers";
export { loadConfig, saveConfig, recordDevice, signalStats, userGraph } from "./repository";

export interface AssessDealInput {
  stage: Stage;
  dealId: string | null;
  buyerId: string;
  sellerId: string;
  amountUsdt: number;
  actingUserId: string;
  meta: RequestMeta | null;
  timing?: { secondsFundedToPaid?: number | null; secondsPaidToRelease?: number | null };
  senderNameMismatch?: { expected: string; actual: string } | null;
}

export interface AntifraudDeps {
  aml: AmlProvider;
  ipIntel: IpIntelProvider;
  now: () => Date;
}

/** Серверна оцінка угоди: збір фактів → engine → збереження з поясненнями. */
export async function assessDeal(db: Db, deps: AntifraudDeps, input: AssessDealInput): Promise<RiskResult & { assessmentId: string }> {
  const cfg = await loadConfig(db);
  const now = deps.now();
  const common = { dealId: input.dealId, cfg, aml: deps.aml, ipIntel: deps.ipIntel, now };
  const [buyer, seller] = await Promise.all([
    gatherParty(db, { ...common, userId: input.buyerId, role: "buyer", meta: input.actingUserId === input.buyerId ? input.meta : null }),
    gatherParty(db, { ...common, userId: input.sellerId, role: "seller", meta: input.actingUserId === input.sellerId ? input.meta : null }),
  ]);
  const hourKyiv = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Kyiv" }).format(now),
  ) % 24;
  const result = evaluate(
    {
      stage: input.stage,
      amountUsdt: input.amountUsdt,
      hourKyiv,
      parties: [buyer, seller],
      partiesLinkedBy: await linksBetween(db, input.buyerId, input.sellerId),
      timing: input.timing,
      senderNameMismatch: input.senderNameMismatch ?? null,
    },
    cfg,
  );
  const assessmentId = await saveAssessment(db, {
    userId: input.actingUserId,
    dealId: input.dealId,
    stage: input.stage,
    result,
    context: { amountUsdt: input.amountUsdt, ip: input.meta?.ip ?? null, device: input.meta?.deviceHash ?? null },
  });
  return { ...result, assessmentId };
}
