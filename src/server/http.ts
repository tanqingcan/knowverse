import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "./errors";
import { requireUser, type CurrentUser } from "./auth";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}
export function fail(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ ok: false, error: { code: e.code, message: e.message, detail: e.detail ?? null } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "请求参数不合法", detail: e.issues } }, { status: 400 });
  }
  console.error("[api] unexpected", e);
  return NextResponse.json({ ok: false, error: { code: "internal", message: "服务器内部错误，请稍后重试" } }, { status: 500 });
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new AppError("invalid_json", "请求体不是合法 JSON"); }
  return schema.parse(raw);
}

type Ctx<P> = { params: Promise<P> };

/** 需要登录的路由：所有业务查询都以 user.id 作为权限条件 */
export function authed<P = Record<string, string>>(fn: (req: NextRequest, user: CurrentUser, params: P) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const user = await requireUser();
      const params = (await ctx?.params) ?? ({} as P);
      const r = await fn(req, user, params);
      return r instanceof Response ? r : ok(r);
    } catch (e) {
      return fail(e);
    }
  };
}

export function open<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const params = (await ctx?.params) ?? ({} as P);
      const r = await fn(req, params);
      return r instanceof Response ? r : ok(r);
    } catch (e) {
      return fail(e);
    }
  };
}
