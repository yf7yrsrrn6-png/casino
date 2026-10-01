import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError, badRequest, forbidden } from "./errors";
import { requireActor, requestMeta, type Actor, type RequireOpts, type RequestMeta } from "./auth";
import { defaultCtx, type Ctx } from "./services/context";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./session";

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

export function route<T>(fn: (a: HandlerArgs) => Promise<T>) {
  return async (req: NextRequest, context: { params: Promise<Params> }) => {
    try {
      checkOrigin(req);
      const params = (await context?.params) ?? {};
      const result = await fn({ req, params, ctx: defaultCtx(), meta: requestMeta(req) });
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: e.issues.map((i) => i.message).join("; "), code: "validation" }, { status: 400 });
      }
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: "Внутрішня помилка сервера" }, { status: 500 });
    }
  };
}

/** Маршрут, що вимагає вхід (і, за потреби, схвалення/роль). */
export function authed<T>(opts: RequireOpts, fn: (a: HandlerArgs & { actor: Actor }) => Promise<T>) {
  return route(async (a) => fn({ ...a, actor: await requireActor(a.req, opts, a.ctx.db) }));
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
