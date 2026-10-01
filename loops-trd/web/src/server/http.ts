import { NextResponse, after, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError, badRequest, forbidden, notFound } from "./errors";
import { requireActor, requestMeta, type Actor, type RequireOpts, type RequestMeta } from "./auth";
import { defaultCtx, type Ctx } from "./services/context";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./session";
import { enforceRateLimit, type RateLimitRule } from "./rate-limit";
import { reportError } from "./monitoring";
import { flushTelegramOutbox, telegramEnabled } from "./telegram";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Загальний ліміт на зміни з одного IP (захист від флуду), окремі правила — на маршрутах. */
const GLOBAL_MUTATION_LIMIT = { limit: 120, windowSec: 60 };

export interface RouteOpts {
  rateLimit?: RateLimitRule;
}

type Params = Record<string, string>;
interface HandlerArgs {
  req: NextRequest;
  params: Params;
  ctx: Ctx;
  meta: RequestMeta;
}

/** Захист від CSRF: мутації лише з власного origin (cookie SameSite=Lax + перевірка Origin). */
function checkOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = new URL(env().APP_URL).host;
  if (new URL(origin).host !== allowed && new URL(origin).host !== req.headers.get("host")) {
    throw forbidden("Запит з чужого домену");
  }
}

export function route<T>(fn: (a: HandlerArgs) => Promise<T>, opts: RouteOpts = {}) {
  return async (req: NextRequest, context: { params: Promise<Params> }) => {
    const mutation = req.method !== "GET" && req.method !== "HEAD";
    try {
      checkOrigin(req);
      const params = (await context?.params) ?? {};
      // Ідентифікатори в шляху — лише UUID (інакше 404, а не помилка БД).
      for (const k of ["id", "userId"]) if (params[k] !== undefined && !UUID_RE.test(params[k])) throw notFound();
      const ctx = defaultCtx();
      const meta = requestMeta(req);
      if (mutation && meta.ip) await enforceRateLimit(ctx.db, `global:${meta.ip}`, GLOBAL_MUTATION_LIMIT.limit, GLOBAL_MUTATION_LIMIT.windowSec);
      if (opts.rateLimit?.by === "ip") {
        await enforceRateLimit(ctx.db, `${opts.rateLimit.name}:${meta.ip ?? "unknown"}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      const result = await fn({ req, params, ctx, meta });
      // Сповіщення в Telegram — після відповіді, щоб не затримувати користувача.
      if (mutation && telegramEnabled()) after(() => flushTelegramOutbox(ctx.db).catch((e) => reportError(e, { where: "telegram" })));
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        const res = NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
        if (e.status === 429 && e.extra?.retryAfter) res.headers.set("Retry-After", String(e.extra.retryAfter));
        return res;
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: e.issues.map((i) => i.message).join("; "), code: "validation" }, { status: 400 });
      }
      reportError(e, { method: req.method, path: req.nextUrl.pathname });
      return NextResponse.json({ error: "Внутрішня помилка сервера. Ми вже знаємо про неї." }, { status: 500 });
    }
  };
}

/** Маршрут, що вимагає вхід (і, за потреби, схвалення/роль та ліміт частоти на користувача). */
export function authed<T>(opts: RequireOpts & RouteOpts, fn: (a: HandlerArgs & { actor: Actor }) => Promise<T>) {
  return route(
    async (a) => {
      const actor = await requireActor(a.req, opts, a.ctx.db);
      if (opts.rateLimit && opts.rateLimit.by !== "ip") {
        await enforceRateLimit(a.ctx.db, `${opts.rateLimit.name}:${actor.id}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      return fn({ ...a, actor });
    },
    { rateLimit: opts.rateLimit?.by === "ip" ? opts.rateLimit : undefined },
  );
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Очікується JSON");
  }
  return schema.parse(raw);
}

export async function rawBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? v : {};
  } catch {
    throw badRequest("Очікується JSON");
  }
}

export function query(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function signedFrom(b: Record<string, unknown>) {
  const s = b.signed as { nonce?: string; signature?: string } | undefined;
  return s && typeof s === "object" ? s : undefined;
}
