import { z } from "zod";
import { body, route } from "@/server/http";
import { createLoginNonce } from "@/server/services/identity";

export const POST = route(async ({ req, ctx }) => {
  const { address } = await body(req, z.object({ address: z.string() }));
  return createLoginNonce(ctx, address);
}, { rateLimit: { name: "nonce", limit: 20, windowSec: 60, by: "ip" } });
